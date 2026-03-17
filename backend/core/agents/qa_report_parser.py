"""
QA Report Parser v3
Parses QA test agent output to extract structured test results.
Two modes:
  1. Structured: agent outputs ---QA_REPORT_START---/---QA_REPORT_END--- markers
  2. Best-effort: semantically analyzes agent conversation for test outcomes
"""
import re
import json
from typing import Optional, List, Dict, Any, Tuple
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger


# ═══════════════════════════════════════════════════════
# PUBLIC API
# ═══════════════════════════════════════════════════════

async def parse_qa_report(raw_text: str) -> Optional[Dict[str, Any]]:
    """Parse QA report. Tries structured markers first, falls back to semantic analysis."""
    if not raw_text:
        return None

    # Try structured markers first
    match = re.search(
        r'---QA_REPORT_START---(.*?)---QA_REPORT_END---',
        raw_text,
        re.DOTALL
    )
    if match:
        result = _parse_structured_report(match.group(1))
        if result and result["total_tests"] > 0:
            return result

    # Fallback: semantic best-effort parsing
    return _parse_semantic(raw_text)


async def update_test_report_from_thread(thread_id: str) -> bool:
    """Fetch messages from a thread, parse QA report, and update test_reports row."""
    try:
        report = await execute_one(
            "SELECT report_id FROM test_reports WHERE thread_id = :thread_id AND status = 'running'",
            {"thread_id": thread_id}
        )
        if not report:
            logger.debug(f"No running test report found for thread {thread_id}")
            return False

        report_id = report["report_id"]
        messages = await execute(
            """
            SELECT type, content
            FROM messages
            WHERE thread_id = :thread_id
              AND type IN ('assistant', 'tool')
            ORDER BY created_at ASC
            """,
            {"thread_id": thread_id}
        )

        if not messages:
            logger.debug(f"No messages found for thread {thread_id}")
            await execute_mutate(
                "UPDATE test_reports SET status = 'failed' WHERE report_id = :report_id",
                {"report_id": report_id}
            )
            return False

        # Build full text from messages
        text_parts = []
        for msg in messages:
            content = msg.get("content")
            if content is None:
                continue
            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except (json.JSONDecodeError, TypeError):
                    text_parts.append(content)
                    continue
            if isinstance(content, dict):
                text_content = content.get("content")
                if text_content and isinstance(text_content, str):
                    text_parts.append(text_content)

        full_text = "\n\n".join(text_parts)
        if not full_text.strip():
            await execute_mutate(
                "UPDATE test_reports SET status = 'completed' WHERE report_id = :report_id",
                {"report_id": report_id}
            )
            return False

        parsed = await parse_qa_report(full_text)

        if not parsed:
            logger.info(f"Could not parse QA report from thread {thread_id}, marking completed")
            await execute_mutate(
                "UPDATE test_reports SET status = 'completed', raw_report = :raw_report WHERE report_id = :report_id",
                {"report_id": report_id, "raw_report": full_text[:50000]}
            )
            return False

        await execute_mutate(
            """
            UPDATE test_reports
            SET status = 'completed', score = :score, total_tests = :total_tests,
                passed = :passed, failed = :failed, warnings = :warnings,
                bugs = CAST(:bugs AS jsonb), raw_report = :raw_report
            WHERE report_id = :report_id
            """,
            {
                "report_id": report_id,
                "score": parsed["score"],
                "total_tests": parsed["total_tests"],
                "passed": parsed["passed"],
                "failed": parsed["failed"],
                "warnings": parsed["warnings"],
                "bugs": json.dumps(parsed["bugs"]),
                "raw_report": full_text[:50000]
            }
        )
        logger.info(
            f"✅ Updated test report {report_id}: "
            f"{parsed['total_tests']} tests, {parsed['passed']} passed, "
            f"{parsed['failed']} failed, {parsed['warnings']} warnings, score={parsed['score']}%"
        )

        # Update project context with test results
        try:
            report_row = await execute_one(
                "SELECT project_id FROM test_reports WHERE report_id = :rid",
                {"rid": report_id}
            )
            if report_row and report_row.get("project_id"):
                from core.agents.qa_api import update_project_after_test
                await update_project_after_test(str(report_row["project_id"]), parsed)
        except Exception as ctx_err:
            logger.warning(f"Failed to update project context: {ctx_err}")

        # Extract site description from structured report if present
        try:
            desc_match = re.search(
                r'## Site Description\s*\n([^\n#]+)',
                full_text
            )
            if desc_match and report_row and report_row.get("project_id"):
                site_desc = desc_match.group(1).strip()
                if len(site_desc) > 10:
                    await execute_mutate(
                        """
                        UPDATE projects
                        SET context = jsonb_set(
                            COALESCE(context, '{}'::jsonb),
                            '{site_description}',
                            to_jsonb(:desc::text)
                        )
                        WHERE project_id = :pid
                        """,
                        {"desc": site_desc[:500], "pid": str(report_row["project_id"])}
                    )
                    logger.info(f"Updated site description for project {report_row['project_id']}")
        except Exception as desc_err:
            logger.debug(f"Could not extract site description: {desc_err}")

        # Extract qualitative notes from agent observations
        try:
            if report_row and report_row.get("project_id"):
                notes = _extract_qualitative_notes(full_text)
                if notes:
                    from core.services.db import execute_one as eo2
                    proj = await eo2(
                        "SELECT context FROM projects WHERE project_id = :pid",
                        {"pid": str(report_row["project_id"])}
                    )
                    if proj:
                        ctx = proj.get("context") or {}
                        if isinstance(ctx, str):
                            ctx = json.loads(ctx)
                        existing_notes = ctx.get("notes", [])
                        # Add new notes, dedup, keep last 15
                        all_notes = existing_notes + notes
                        seen = set()
                        deduped = []
                        for n in all_notes:
                            key = n.lower()[:50]
                            if key not in seen:
                                seen.add(key)
                                deduped.append(n)
                        ctx["notes"] = deduped[-15:]
                        await execute_mutate(
                            "UPDATE projects SET context = CAST(:ctx AS jsonb) WHERE project_id = :pid",
                            {"ctx": json.dumps(ctx), "pid": str(report_row["project_id"])}
                        )
                        logger.info(f"Saved {len(notes)} qualitative notes for project {report_row['project_id']}")
        except Exception as notes_err:
            logger.debug(f"Could not extract qualitative notes: {notes_err}")

        return True

    except Exception as e:
        logger.error(f"Error updating test report from thread {thread_id}: {str(e)}")
        try:
            await execute_mutate(
                "UPDATE test_reports SET status = 'completed' WHERE thread_id = :thread_id AND status = 'running'",
                {"thread_id": thread_id}
            )
        except Exception:
            pass
        return False


async def process_completed_agent_run(agent_run_id: str, thread_id: str) -> None:
    """Called when an agent_run completes. Updates QA report if applicable."""
    try:
        report_exists = await execute_one(
            "SELECT report_id FROM test_reports WHERE thread_id = :thread_id",
            {"thread_id": thread_id}
        )
        if report_exists:
            logger.info(f"Agent run {agent_run_id} completed - processing QA report for thread {thread_id}")
            await update_test_report_from_thread(thread_id)
    except Exception as e:
        logger.error(f"Error processing completed agent run {agent_run_id}: {str(e)}")


# ═══════════════════════════════════════════════════════
# STRUCTURED PARSING (with markers)
# ═══════════════════════════════════════════════════════

def _parse_structured_report(report_content: str) -> Optional[Dict[str, Any]]:
    """Parse the structured report between markers."""
    total_tests = passed = failed = warnings = 0

    summary_match = re.search(r'## Test Summary(.*?)(?=##|\Z)', report_content, re.DOTALL)
    if summary_match:
        s = summary_match.group(1)
        total_tests = _extract_int(r'-\s*Total Tests:\s*(\d+)', s)
        passed = _extract_int(r'-\s*Passed:\s*(\d+)', s)
        failed = _extract_int(r'-\s*Failed:\s*(\d+)', s)
        warnings = _extract_int(r'-\s*Warnings:\s*(\d+)', s)

    bugs = []
    results_match = re.search(r'## Test Results(.*)', report_content, re.DOTALL)
    if results_match:
        for block in re.split(r'### Test:', results_match.group(1))[1:]:
            bug = _parse_test_block(block)
            if bug.get('name'):
                bugs.append(bug)

    # Recalculate from bugs if summary is inconsistent
    if bugs and total_tests == 0:
        total_tests = len(bugs)
        passed = sum(1 for b in bugs if b.get('status') == 'PASS')
        failed = sum(1 for b in bugs if b.get('status') == 'FAIL')
        warnings = sum(1 for b in bugs if b.get('status') == 'WARNING')

    score = round((passed / total_tests * 100)) if total_tests > 0 else 0
    return {"total_tests": total_tests, "passed": passed, "failed": failed, "warnings": warnings, "score": score, "bugs": bugs}


def _parse_test_block(block: str) -> Dict[str, Any]:
    """Parse a single ### Test: block."""
    bug: Dict[str, Any] = {}
    name_match = re.match(r'([^\n]+)', block)
    if name_match:
        bug['name'] = name_match.group(1).strip()

    for field, pattern in [
        ('status', r'\*\*Status\*\*:\s*(PASS|FAIL|WARNING)'),
        ('severity', r'\*\*Severity\*\*:\s*(Critical|High|Medium|Low)'),
        ('description', r'\*\*Description\*\*:\s*([^\n]+)'),
        ('expected', r'\*\*Expected\*\*:\s*([^\n]+)'),
        ('actual', r'\*\*Actual\*\*:\s*([^\n]+)'),
    ]:
        m = re.search(pattern, block, re.IGNORECASE)
        if m:
            val = m.group(1).strip()
            if field == 'status':
                val = val.upper()
            elif field == 'severity':
                val = val.capitalize()
            bug[field] = val

    screenshot_match = re.search(r'\*\*Screenshot\*\*:\s*([^\n]+)', block)
    if screenshot_match:
        t = screenshot_match.group(1).strip()
        bug['screenshot_url'] = None if t.lower() in ('n/a', 'none', '-', '') else t
    else:
        bug['screenshot_url'] = None

    return bug


# ═══════════════════════════════════════════════════════
# SEMANTIC BEST-EFFORT PARSING
# ═══════════════════════════════════════════════════════

# Patterns that indicate test actions and their outcomes
_FAIL_PATTERNS = [
    (r'404\b.*(?:error|not found|page)', 'Page Not Found (404)', 'Medium'),
    (r'(?:ssl|certificate).*(?:error|invalid|expired|untrusted)', 'SSL Certificate Issue', 'Critical'),
    (r'(?:500|internal server error)', 'Server Error (500)', 'Critical'),
    (r'(?:403|forbidden|access denied)', 'Access Denied (403)', 'High'),
    (r'(?:timeout|timed? ?out).*(?:loading|page|request)', 'Page Timeout', 'High'),
    (r'(?:crash|unresponsive|blank page|white screen)', 'Application Crash', 'Critical'),
    (r'(?:form|input|field).*(?:not work|broken|error|fail)', 'Form Error', 'High'),
    (r'(?:button|link|click).*(?:not work|broken|nothing happen|no response|unresponsive)', 'Broken Interactive Element', 'High'),
    (r'(?:login|signup|sign.?up|register).*(?:fail|error|not work|broken)', 'Authentication Flow Error', 'Critical'),
    (r'(?:console|javascript).*(?:error|exception)', 'JavaScript Error', 'Medium'),
    (r'(?:image|img|icon|logo).*(?:broken|missing|not load|404)', 'Broken Image/Asset', 'Medium'),
    (r'(?:layout|css|style).*(?:broken|overflow|overlap|misalign)', 'Layout Issue', 'Medium'),
    (r'(?:redirect).*(?:loop|infinite|error)', 'Redirect Issue', 'High'),
]

_WARNING_PATTERNS = [
    (r'(?:slow|takes? (?:long|too)|performance).*(?:load|page|response)', 'Slow Page Load', 'Medium'),
    (r'(?:missing|no).*(?:meta|title|description|alt text|favicon)', 'Missing SEO/Accessibility Element', 'Low'),
    (r'(?:confusing|unclear|hard to find|bad ux|poor ux|not intuitive)', 'UX Issue', 'Medium'),
    (r'(?:deprecat|outdated|old version)', 'Outdated Component', 'Low'),
    (r'(?:responsive|mobile).*(?:issue|problem|not.*work)', 'Responsive Design Issue', 'Medium'),
    (r'(?:placeholder|lorem ipsum|todo|fixme|dummy)', 'Placeholder Content', 'Low'),
    (r'(?:no.*error.*handling|error.*not.*shown|silent.*fail)', 'Missing Error Handling', 'Medium'),
]

_PASS_PATTERNS = [
    (r'(?:successfully|success).*(?:navigat|load|open|access|connect)', 'pass'),
    (r'(?:page|site|homepage).*(?:load|display|render|show).*(?:correct|proper|success|fine|ok)', 'pass'),
    (r'(?:form|login|signup).*(?:submit|work|success|complet)', 'pass'),
    (r'(?:button|link|menu).*(?:work|click|functional|respond)', 'pass'),
    (r'(?:ssl|https|certificate).*(?:valid|secure|ok)', 'pass'),
    (r'(?:responsive|mobile|viewport).*(?:work|correct|adapt|ok)', 'pass'),
]


def _parse_semantic(raw_text: str) -> Optional[Dict[str, Any]]:
    """
    Semantically analyze agent conversation to extract test results.
    Much smarter than simple navigation counting.
    """
    bugs: List[Dict[str, Any]] = []
    seen_findings: set = set()  # Dedup by (name, status) tuple

    # Split into sentences for analysis
    sentences = _split_to_sentences(raw_text)

    # 1. Detect failures
    for sentence in sentences:
        s_lower = sentence.lower()
        for pattern, name, severity in _FAIL_PATTERNS:
            if re.search(pattern, s_lower):
                key = (name, 'FAIL')
                if key not in seen_findings:
                    seen_findings.add(key)
                    bugs.append({
                        'name': name,
                        'status': 'FAIL',
                        'severity': severity,
                        'description': _clean_sentence(sentence),
                        'expected': 'No errors or issues',
                        'actual': _clean_sentence(sentence),
                        'screenshot_url': None,
                    })
                break

    # 2. Detect warnings
    for sentence in sentences:
        s_lower = sentence.lower()
        for pattern, name, severity in _WARNING_PATTERNS:
            if re.search(pattern, s_lower):
                key = (name, 'WARNING')
                if key not in seen_findings:
                    seen_findings.add(key)
                    bugs.append({
                        'name': name,
                        'status': 'WARNING',
                        'severity': severity,
                        'description': _clean_sentence(sentence),
                        'expected': 'Best practice compliance',
                        'actual': _clean_sentence(sentence),
                        'screenshot_url': None,
                    })
                break

    # 3. Detect successful navigation/actions (from tool results)
    nav_urls = re.findall(r'"message":\s*"Navigated to (https?://[^\s"]+)"', raw_text)
    seen_nav = set()
    for url in nav_urls:
        domain_path = _url_to_label(url)
        if domain_path not in seen_nav:
            seen_nav.add(domain_path)
            # Check if any bug is related to this URL
            has_issue = any(
                url in b.get('description', '') or domain_path in b.get('name', '')
                for b in bugs
            )
            if not has_issue:
                bugs.append({
                    'name': f'Page Load: {domain_path}',
                    'status': 'PASS',
                    'severity': 'Low',
                    'description': f'Successfully navigated to {url}',
                    'expected': 'Page loads without errors',
                    'actual': 'Page loaded successfully',
                    'screenshot_url': None,
                })

    # 4. Detect successful form interactions
    form_actions = re.findall(
        r'"message":\s*"[^"]*(?:fill|type|click|select|submit|check)[^"]*"[^}]*"success":\s*true',
        raw_text,
        re.IGNORECASE
    )
    if form_actions:
        key = ('Form Interaction', 'PASS')
        if key not in seen_findings:
            seen_findings.add(key)
            bugs.append({
                'name': 'Form Interaction',
                'status': 'PASS',
                'severity': 'Low',
                'description': f'Successfully completed {len(form_actions)} form interactions',
                'expected': 'Form elements are interactive',
                'actual': f'{len(form_actions)} interactions completed successfully',
                'screenshot_url': None,
            })

    # 5. Detect screenshot captures (= visual verification done)
    screenshots = re.findall(
        r'(?:screenshot|Screenshot).*(?:taken|captured|saved|uploaded)',
        raw_text
    )
    if screenshots:
        key = ('Visual Verification', 'PASS')
        if key not in seen_findings:
            seen_findings.add(key)
            bugs.append({
                'name': 'Visual Verification',
                'status': 'PASS',
                'severity': 'Low',
                'description': f'{len(screenshots)} screenshots captured during testing',
                'expected': 'Visual state captured for review',
                'actual': f'{len(screenshots)} screenshots taken',
                'screenshot_url': None,
            })

    # 6. Detect signup/login flow outcomes
    signup_success = re.search(
        r'(?:sign.?up|register|account.*creat|verif).*(?:success|complet|done|confirm)',
        raw_text, re.IGNORECASE
    )
    if signup_success:
        key = ('Signup Flow', 'PASS')
        if key not in seen_findings:
            seen_findings.add(key)
            bugs.append({
                'name': 'Signup Flow',
                'status': 'PASS',
                'severity': 'Low',
                'description': 'User registration/signup completed successfully',
                'expected': 'User can create an account',
                'actual': 'Account created successfully',
                'screenshot_url': None,
            })

    login_success = re.search(
        r'(?:log.?in|sign.?in|auth).*(?:success|complet|done|dashboard|redirect)',
        raw_text, re.IGNORECASE
    )
    if login_success and ('Signup Flow', 'PASS') not in seen_findings:
        key = ('Login Flow', 'PASS')
        if key not in seen_findings:
            seen_findings.add(key)
            bugs.append({
                'name': 'Login Flow',
                'status': 'PASS',
                'severity': 'Low',
                'description': 'User login completed successfully',
                'expected': 'User can log in',
                'actual': 'Login successful',
                'screenshot_url': None,
            })

    # 7. Detect agent/resource creation outcomes
    creation_success = re.search(
        r'(?:creat|add|set.?up|deploy|build|configur).*(?:agent|project|resource|workspace).*(?:success|complet|done)',
        raw_text, re.IGNORECASE
    )
    if creation_success:
        key = ('Resource Creation', 'PASS')
        if key not in seen_findings:
            seen_findings.add(key)
            bugs.append({
                'name': 'Resource Creation',
                'status': 'PASS',
                'severity': 'Low',
                'description': 'Successfully created a resource/agent',
                'expected': 'User can create resources',
                'actual': 'Resource created successfully',
                'screenshot_url': None,
            })

    # Count totals
    passed = sum(1 for b in bugs if b['status'] == 'PASS')
    failed = sum(1 for b in bugs if b['status'] == 'FAIL')
    warnings_count = sum(1 for b in bugs if b['status'] == 'WARNING')
    total_tests = passed + failed + warnings_count

    if total_tests == 0:
        return None

    score = round((passed / total_tests * 100)) if total_tests > 0 else 0

    # Sort: FAIL first (by severity), then WARNING, then PASS
    severity_order = {'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3}
    status_order = {'FAIL': 0, 'WARNING': 1, 'PASS': 2}
    bugs.sort(key=lambda b: (
        status_order.get(b.get('status', 'PASS'), 9),
        severity_order.get(b.get('severity', 'Low'), 9)
    ))

    return {
        "total_tests": total_tests,
        "passed": passed,
        "failed": failed,
        "warnings": warnings_count,
        "score": score,
        "bugs": bugs
    }


# ═══════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════

def _extract_int(pattern: str, text: str) -> int:
    m = re.search(pattern, text, re.IGNORECASE)
    return int(m.group(1)) if m else 0


def _split_to_sentences(text: str) -> List[str]:
    """Split text into meaningful chunks for analysis."""
    # Split on newlines, periods, and common delimiters
    chunks = re.split(r'[.\n]+', text)
    return [c.strip() for c in chunks if len(c.strip()) > 15]


def _clean_sentence(s: str) -> str:
    """Clean a sentence for display in report."""
    s = s.strip()
    # Remove JSON artifacts
    s = re.sub(r'[\{\}"\\]', '', s)
    # Collapse whitespace
    s = re.sub(r'\s+', ' ', s)
    return s[:250]


def _url_to_label(url: str) -> str:
    """Convert URL to a short readable label."""
    label = re.sub(r'^https?://(www\.)?', '', url)
    label = label.rstrip('/')
    return label[:60]


def _extract_qualitative_notes(raw_text: str) -> List[str]:
    """
    Extract qualitative observations from agent conversation.
    These are UX insights, usability notes, and observations that go beyond pass/fail.
    """
    notes = []
    seen = set()

    # Patterns that capture qualitative observations
    _NOTE_PATTERNS = [
        # UX observations
        (r'(?:the|this)?\s*(?:ui|ux|interface|design|layout)\s+(?:is|looks?|seems?|appears?)\s+([^.]{15,100})', 'UX'),
        (r'(?:confusing|unclear|hard to (?:find|use|understand)|not intuitive|cluttered)\s*[^.]{0,80}', 'UX'),
        (r'(?:user (?:experience|flow|journey)).*?(?:is|could be|should be)\s+([^.]{10,100})', 'UX'),

        # Performance observations
        (r'(?:page|site|app)\s+(?:loads?|took|takes?)\s+(?:slow|fast|quick|\d+\s*(?:second|ms))[^.]{0,60}', 'Performance'),
        (r'(?:slow|fast|quick)\s+(?:loading|response|render)[^.]{0,60}', 'Performance'),

        # Functionality observations
        (r'(?:the|this)?\s*(?:form|button|link|menu|modal|popup|dropdown)\s+(?:doesn\'t|does not|isn\'t|is not|failed to)\s+([^.]{10,80})', 'Functionality'),
        (r'(?:feature|function|option)\s+(?:is missing|not available|doesn\'t exist|not implemented)[^.]{0,60}', 'Functionality'),

        # Content/copy observations
        (r'(?:text|copy|content|label|message)\s+(?:is|says?|reads?|shows?)\s+([^.]{10,80})', 'Content'),
        (r'(?:placeholder|lorem ipsum|todo|fixme|test data|dummy)[^.]{0,60}', 'Content'),

        # Mobile/responsive observations
        (r'(?:on mobile|responsive|viewport|screen size)\s*[,:.]?\s*([^.]{10,80})', 'Mobile'),

        # Auth/signup observations
        (r'(?:signup|sign.?up|registration|login|sign.?in)\s+(?:flow|process|form|page)\s+([^.]{10,80})', 'Auth Flow'),
        (r'(?:email verification|otp|confirmation|magic link)[^.]{0,80}', 'Auth Flow'),

        # Error handling observations
        (r'(?:error (?:message|handling|page|state))\s+([^.]{10,80})', 'Error Handling'),
        (r'(?:no (?:error|feedback|message) (?:shown|displayed|given))[^.]{0,60}', 'Error Handling'),

        # Navigation observations
        (r'(?:navigation|nav|menu|sidebar|header|footer)\s+(?:is|has|contains|missing)[^.]{0,80}', 'Navigation'),
    ]

    # Only look at assistant messages (not tool outputs)
    # Split by common message boundaries
    chunks = raw_text.split('\n')

    for chunk in chunks:
        chunk_clean = chunk.strip()
        if len(chunk_clean) < 20 or len(chunk_clean) > 500:
            continue

        # Skip JSON/tool output
        if chunk_clean.startswith('{') or chunk_clean.startswith('[') or '": ' in chunk_clean:
            continue

        for pattern, category in _NOTE_PATTERNS:
            match = re.search(pattern, chunk_clean, re.IGNORECASE)
            if match:
                # Get the full matched text or the first group
                note_text = match.group(0).strip()
                # Clean it up
                note_text = re.sub(r'[\{\}"\\]', '', note_text)
                note_text = re.sub(r'\s+', ' ', note_text).strip()

                if len(note_text) > 15:
                    dedup_key = note_text.lower()[:40]
                    if dedup_key not in seen:
                        seen.add(dedup_key)
                        notes.append(f"[{category}] {note_text[:150]}")
                break

    return notes[:10]  # Max 10 notes per test
