"""
QA Testing API endpoints for Breakit.
Connects the test input form to the agent pipeline with QA-specific prompts.
Projects have memory: each test accumulates context about the site.
"""
import json
import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime
from urllib.parse import urlparse

from core.agents.api import start_agent_run
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.prompts.qa_testing_prompt import QA_TESTING_SYSTEM_PROMPT
from core.prompts.test_templates import (
    FULL_AUDIT, SIGNUP_FLOW, CHECKOUT_FLOW, FORM_VALIDATION, RESPONSIVE_CHECK
)
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/qa", tags=["QA Testing"])

TEMPLATE_MAP = {
    "full-audit": FULL_AUDIT,
    "signup-flow": SIGNUP_FLOW,
    "checkout-flow": CHECKOUT_FLOW,
    "form-validation": FORM_VALIDATION,
    "responsive-check": RESPONSIVE_CHECK,
}


# ═══════════════════════════════════════════════════════
# PROJECT MEMORY
# ═══════════════════════════════════════════════════════

async def get_or_create_project(user_id: str, url: str, project_id: Optional[str] = None) -> dict:
    """
    Get existing project for this URL/user, or create one.
    Projects are keyed by site_url (domain) so all tests for the same site share context.
    """
    parsed = urlparse(url)
    domain = parsed.netloc or parsed.path.split('/')[0]
    site_url = f"{parsed.scheme}://{domain}" if parsed.scheme else f"https://{domain}"

    # If project_id provided, try to use it
    if project_id:
        existing = await execute_one(
            "SELECT project_id, name, context, test_summary FROM projects WHERE project_id = :pid AND account_id = :uid",
            {"pid": project_id, "uid": user_id}
        )
        if existing:
            # Update site_url if not set
            if not existing.get("site_url"):
                await execute_mutate(
                    "UPDATE projects SET site_url = :url, project_type = 'qa' WHERE project_id = :pid",
                    {"url": site_url, "pid": project_id}
                )
            return dict(existing)

    # Look for existing project by site_url
    existing = await execute_one(
        """
        SELECT project_id, name, context, test_summary
        FROM projects
        WHERE account_id = :uid AND site_url = :url AND project_type = 'qa'
        ORDER BY created_at DESC LIMIT 1
        """,
        {"uid": user_id, "url": site_url}
    )
    if existing:
        return dict(existing)

    # Create new project
    new_id = str(uuid.uuid4())
    await execute_mutate(
        """
        INSERT INTO projects (project_id, name, description, account_id, site_url, project_type, context, test_summary)
        VALUES (:pid, :name, :desc, :uid, :url, 'qa', :ctx, :summary)
        """,
        {
            "pid": new_id,
            "name": f"QA: {domain}",
            "desc": f"QA testing project for {site_url}",
            "uid": user_id,
            "url": site_url,
            "ctx": json.dumps({"site_url": site_url, "domain": domain, "notes": [], "known_issues": []}),
            "summary": json.dumps({"total_runs": 0, "scores": [], "recurring_issues": []}),
        }
    )
    logger.info(f"Created QA project {new_id} for {domain}")
    return {"project_id": new_id, "name": f"QA: {domain}", "context": {}, "test_summary": {}}


async def build_project_context_prompt(project_id: str, user_id: str) -> str:
    """
    Build a prompt section with project memory:
    - Site description and known info
    - Previous test results summary
    - Known recurring issues
    - Score trend
    """
    parts = []

    # Get project info
    project = await execute_one(
        "SELECT name, description, context, test_summary, site_url FROM projects WHERE project_id = :pid",
        {"pid": project_id}
    )
    if not project:
        return ""

    context = project.get("context") or {}
    summary = project.get("test_summary") or {}

    if isinstance(context, str):
        try:
            context = json.loads(context)
        except Exception:
            context = {}
    if isinstance(summary, str):
        try:
            summary = json.loads(summary)
        except Exception:
            summary = {}

    # Site info
    if context.get("site_description") or context.get("tech_stack") or context.get("notes"):
        parts.append("## 🧠 Project Memory (from previous tests)")
        if context.get("site_description"):
            parts.append(f"**Site Description:** {context['site_description']}")
        if context.get("tech_stack"):
            parts.append(f"**Tech Stack:** {context['tech_stack']}")
        if context.get("notes"):
            parts.append("**Notes:**")
            for note in context["notes"][-5:]:  # Last 5 notes
                parts.append(f"  - {note}")

    # Previous test history
    prev_tests = await execute(
        """
        SELECT test_type, score, total_tests, passed, failed, warnings,
               bugs, created_at
        FROM test_reports
        WHERE project_id = :pid AND account_id = :uid AND status = 'completed'
        ORDER BY created_at DESC LIMIT 5
        """,
        {"pid": project_id, "uid": user_id}
    )

    if prev_tests:
        parts.append("\n## 📊 Previous Test Results (most recent first)")
        for i, t in enumerate(prev_tests):
            score = t.get("score", "N/A")
            test_type = t.get("test_type", "unknown")
            date = t.get("created_at", "")
            if hasattr(date, "strftime"):
                date = date.strftime("%Y-%m-%d %H:%M")
            parts.append(
                f"**Test #{i+1}** ({date}) — {test_type} — Score: {score}% "
                f"({t.get('passed', 0)} passed, {t.get('failed', 0)} failed, {t.get('warnings', 0)} warnings)"
            )

            # Add top bugs from this test
            bugs = t.get("bugs") or []
            if isinstance(bugs, str):
                try:
                    bugs = json.loads(bugs)
                except Exception:
                    bugs = []
            failed_bugs = [b for b in bugs if b.get("status") == "FAIL"]
            if failed_bugs:
                for bug in failed_bugs[:3]:
                    parts.append(f"  ❌ {bug.get('name', 'Unknown')}: {bug.get('description', '')[:100]}")

    # Known recurring issues
    if summary.get("recurring_issues"):
        parts.append("\n## ⚠️ Known Recurring Issues")
        for issue in summary["recurring_issues"][-5:]:
            parts.append(f"  - {issue}")

    # Score trend
    if summary.get("scores") and len(summary["scores"]) > 1:
        scores = summary["scores"]
        trend = "📈 improving" if scores[-1] > scores[0] else "📉 declining" if scores[-1] < scores[0] else "➡️ stable"
        parts.append(f"\n**Score Trend:** {' → '.join(str(s) for s in scores[-5:])}% ({trend})")

    if parts:
        parts.append(
            "\n**Use this context to:**\n"
            "- Focus on previously failing areas to check if they're fixed\n"
            "- Don't re-test things that consistently pass (unless doing a full audit)\n"
            "- Note if previously broken things are now working (regression check)\n"
            "- Add new findings to help future tests\n"
        )

    return "\n".join(parts)


async def update_project_after_test(project_id: str, report_data: dict) -> None:
    """
    Update project context and test_summary after a test completes.
    Accumulates knowledge over time.
    """
    try:
        project = await execute_one(
            "SELECT context, test_summary FROM projects WHERE project_id = :pid",
            {"pid": project_id}
        )
        if not project:
            return

        context = project.get("context") or {}
        summary = project.get("test_summary") or {}

        if isinstance(context, str):
            try:
                context = json.loads(context)
            except Exception:
                context = {}
        if isinstance(summary, str):
            try:
                summary = json.loads(summary)
            except Exception:
                summary = {}

        # Update test_summary
        summary["total_runs"] = summary.get("total_runs", 0) + 1
        scores = summary.get("scores", [])
        if report_data.get("score") is not None:
            scores.append(report_data["score"])
            summary["scores"] = scores[-20:]  # Keep last 20 scores

        # Track recurring issues (bugs that appear in multiple tests)
        bugs = report_data.get("bugs", [])
        if isinstance(bugs, str):
            try:
                bugs = json.loads(bugs)
            except Exception:
                bugs = []

        existing_issues = set(summary.get("recurring_issues", []))
        known_issues = set(context.get("known_issues", []))

        for bug in bugs:
            if bug.get("status") == "FAIL":
                issue_name = bug.get("name", "Unknown issue")
                if issue_name in known_issues:
                    # This issue appeared before — it's recurring
                    existing_issues.add(issue_name)
                else:
                    known_issues.add(issue_name)

        summary["recurring_issues"] = list(existing_issues)[-10:]
        context["known_issues"] = list(known_issues)[-20:]

        # Save
        await execute_mutate(
            "UPDATE projects SET context = CAST(:ctx AS jsonb), test_summary = CAST(:summary AS jsonb) WHERE project_id = :pid",
            {
                "pid": project_id,
                "ctx": json.dumps(context),
                "summary": json.dumps(summary),
            }
        )
        logger.info(f"Updated project {project_id} context: {summary.get('total_runs')} runs, {len(known_issues)} known issues")

    except Exception as e:
        logger.warning(f"Failed to update project context for {project_id}: {e}")


# ═══════════════════════════════════════════════════════
# API ENDPOINTS
# ═══════════════════════════════════════════════════════

class TestCredentials(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None


class StartTestRequest(BaseModel):
    url: str
    test_type: str
    specs: Optional[str] = None
    viewport: str = "desktop"
    credentials: Optional[TestCredentials] = None
    project_id: Optional[str] = None


class StartTestResponse(BaseModel):
    thread_id: str
    project_id: str
    agent_run_id: str
    report_id: str


@router.post("/start-test", response_model=StartTestResponse, summary="Start QA Test")
async def start_qa_test(
    request: StartTestRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Start an AI-powered QA test on a URL. Auto-creates/reuses project for the site."""

    # 1. Get or create project for this URL
    project = await get_or_create_project(user_id, request.url, request.project_id)
    project_id = str(project["project_id"])

    # 2. Build prompt with project context
    prompt_parts = []
    prompt_parts.append(f"# QA Test Request\n\n**Target URL:** {request.url}")

    # Inject project memory
    project_context = await build_project_context_prompt(project_id, user_id)
    if project_context:
        prompt_parts.append(f"\n{project_context}")

    # Add template instructions
    template = TEMPLATE_MAP.get(request.test_type)
    if template:
        prompt_parts.append(f"\n## Test Type: {template['name']}\n{template['system_prompt_addition']}")
        prompt_parts.append(f"\n**Steps hint:** {template['steps_hint']}")
    elif request.test_type == "custom":
        if not request.specs:
            raise HTTPException(status_code=400, detail="specs required for custom test type")

    if request.specs:
        prompt_parts.append(f"\n## Additional Test Specifications\n{request.specs}")

    viewport_instructions = {
        "desktop": "Test at desktop viewport (1280px width).",
        "mobile": "Test at mobile viewport (375px width).",
        "both": "Test at both mobile (375px) and desktop (1280px) viewports.",
    }
    prompt_parts.append(f"\n## Viewport\n{viewport_instructions.get(request.viewport, viewport_instructions['desktop'])}")

    if request.credentials and (request.credentials.email or request.credentials.password):
        prompt_parts.append(
            f"\n## Test Credentials\n"
            f"- Email: {request.credentials.email or 'N/A'}\n"
            f"- Password: {request.credentials.password or 'N/A'}"
        )

    # Report format instructions
    prompt_parts.append(
        "\n## CRITICAL: Structured Report Output\n"
        "You MUST end your work with a structured report in this EXACT format.\n"
        "This is MANDATORY - without it, test results cannot be saved.\n\n"
        "After completing ALL tests, output this block:\n\n"
        "---QA_REPORT_START---\n"
        "## Test Summary\n"
        "- Total Tests: [number]\n"
        "- Passed: [number]\n"
        "- Failed: [number]\n"
        "- Warnings: [number]\n\n"
        "## Site Description\n"
        "[Brief description of what the site is, what it does, tech stack if visible]\n\n"
        "## Test Results\n\n"
        "### Test: [Descriptive Test Name]\n"
        "**Status**: PASS | FAIL | WARNING\n"
        "**Severity**: Critical | High | Medium | Low\n"
        "**Description**: [what was tested in detail]\n"
        "**Expected**: [what should happen]\n"
        "**Actual**: [what actually happened]\n"
        "**Screenshot**: [screenshot name if taken, or N/A]\n\n"
        "(repeat for each test)\n\n"
        "---QA_REPORT_END---\n\n"
        "## Important Testing Guidelines\n"
        "- Take screenshots at EVERY important step\n"
        "- Test REAL functionality, not just page loads\n"
        "- If signup is needed and no credentials provided, use https://tempmail.plus to get a temp email\n"
        "- Try to complete the FULL user journey, don't stop early\n"
        "- Report UX issues, confusing flows, and missing features as WARNINGS\n"
        "- Report broken functionality, errors, and crashes as FAIL\n"
        "- Each meaningful check should be a separate test entry\n"
        "- If this is a repeat test, compare with previous results noted above\n"
    )

    combined_prompt = "\n".join(prompt_parts)

    # 3. Start agent run
    try:
        result = await start_agent_run(
            account_id=user_id,
            prompt=combined_prompt,
            model_name="otacon/basic",
            project_id=project_id,
            metadata={
                "qa_test": True,
                "test_type": request.test_type,
                "test_url": request.url,
                "viewport": request.viewport,
                "custom_system_prompt": QA_TESTING_SYSTEM_PROMPT,
                "max_steps": 50,
                "qa_project_id": project_id,  # For post-test context update
            },
        )

        # 4. Create test_reports row
        report_id = str(uuid.uuid4())
        await execute_mutate(
            """
            INSERT INTO test_reports (
                report_id, thread_id, project_id, account_id,
                test_url, test_type, viewport, status
            ) VALUES (
                :report_id, :thread_id, :project_id, :account_id,
                :test_url, :test_type, :viewport, 'running'
            )
            """,
            {
                "report_id": report_id,
                "thread_id": result["thread_id"],
                "project_id": project_id,
                "account_id": user_id,
                "test_url": request.url,
                "test_type": request.test_type,
                "viewport": request.viewport,
            }
        )

        return StartTestResponse(
            thread_id=result["thread_id"],
            project_id=project_id,
            agent_run_id=result["agent_run_id"],
            report_id=report_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start test: {str(e)}")


class TestReportListItem(BaseModel):
    report_id: str
    thread_id: Optional[str]
    project_id: Optional[str]
    test_url: str
    test_type: str
    viewport: str
    status: str
    score: Optional[int]
    total_tests: int
    passed: int
    failed: int
    warnings: int
    created_at: datetime
    updated_at: datetime


class TestReportDetail(BaseModel):
    report_id: str
    thread_id: Optional[str]
    project_id: Optional[str]
    account_id: str
    test_url: str
    test_type: str
    viewport: str
    status: str
    score: Optional[int]
    total_tests: int
    passed: int
    failed: int
    warnings: int
    bugs: List[dict]
    raw_report: Optional[str]
    created_at: datetime
    updated_at: datetime


class UpdateReportRequest(BaseModel):
    project_id: Optional[str] = None


@router.get("/reports", response_model=List[TestReportListItem], summary="Get Test Reports")
async def get_test_reports(
    project_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get list of test reports for the authenticated user."""
    try:
        query = """
            SELECT report_id, thread_id, project_id, test_url, test_type,
                   viewport, status, score, total_tests, passed, failed,
                   warnings, created_at, updated_at
            FROM test_reports WHERE account_id = :account_id
        """
        params = {"account_id": user_id, "limit": limit, "offset": offset}
        if project_id:
            query += " AND project_id = :project_id"
            params["project_id"] = project_id
        query += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset"
        rows = await execute(query, params)
        return [
            TestReportListItem(
                report_id=str(r["report_id"]),
                thread_id=str(r["thread_id"]) if r["thread_id"] else None,
                project_id=str(r["project_id"]) if r["project_id"] else None,
                test_url=r["test_url"], test_type=r["test_type"], viewport=r["viewport"],
                status=r["status"], score=r["score"], total_tests=r["total_tests"],
                passed=r["passed"], failed=r["failed"], warnings=r["warnings"],
                created_at=r["created_at"], updated_at=r["updated_at"],
            )
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch reports: {str(e)}")


@router.get("/reports/{report_id}", response_model=TestReportDetail, summary="Get Test Report Detail")
async def get_test_report(
    report_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get full detail of a specific test report."""
    try:
        row = await execute_one(
            """SELECT report_id, thread_id, project_id, account_id, test_url,
                      test_type, viewport, status, score, total_tests, passed,
                      failed, warnings, bugs, raw_report, created_at, updated_at
               FROM test_reports WHERE report_id = :report_id AND account_id = :account_id""",
            {"report_id": report_id, "account_id": user_id}
        )
        if not row:
            raise HTTPException(status_code=404, detail="Test report not found")
        return TestReportDetail(
            report_id=str(row["report_id"]),
            thread_id=str(row["thread_id"]) if row["thread_id"] else None,
            project_id=str(row["project_id"]) if row["project_id"] else None,
            account_id=str(row["account_id"]),
            test_url=row["test_url"], test_type=row["test_type"], viewport=row["viewport"],
            status=row["status"], score=row["score"], total_tests=row["total_tests"],
            passed=row["passed"], failed=row["failed"], warnings=row["warnings"],
            bugs=row["bugs"] or [], raw_report=row["raw_report"],
            created_at=row["created_at"], updated_at=row["updated_at"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch report: {str(e)}")


@router.patch("/reports/{report_id}", summary="Update Test Report")
async def update_test_report(
    report_id: str,
    request: UpdateReportRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Assign or unassign a test report to/from a project."""
    try:
        existing = await execute_one(
            "SELECT report_id FROM test_reports WHERE report_id = :report_id AND account_id = :account_id",
            {"report_id": report_id, "account_id": user_id}
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Test report not found")
        await execute_mutate(
            "UPDATE test_reports SET project_id = :project_id WHERE report_id = :report_id",
            {"report_id": report_id, "project_id": request.project_id}
        )
        return {"message": "Report updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update report: {str(e)}")


class ProjectContextResponse(BaseModel):
    project_id: str
    name: str
    site_url: Optional[str]
    context: dict
    test_summary: dict
    total_tests: int


@router.get("/projects/{project_id}/context", response_model=ProjectContextResponse)
async def get_project_context(
    project_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get project context and accumulated knowledge."""
    try:
        project = await execute_one(
            """SELECT project_id, name, site_url, context, test_summary
               FROM projects WHERE project_id = :pid AND account_id = :uid""",
            {"pid": project_id, "uid": user_id}
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        context = project.get("context") or {}
        summary = project.get("test_summary") or {}
        if isinstance(context, str):
            context = json.loads(context)
        if isinstance(summary, str):
            summary = json.loads(summary)

        # Count total tests
        count_row = await execute_one(
            "SELECT COUNT(*) as cnt FROM test_reports WHERE project_id = :pid",
            {"pid": project_id}
        )
        total_tests = count_row["cnt"] if count_row else 0

        return ProjectContextResponse(
            project_id=str(project["project_id"]),
            name=project["name"],
            site_url=project.get("site_url"),
            context=context,
            test_summary=summary,
            total_tests=total_tests,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════
# PROJECTS LIST & DETAIL
# ═══════════════════════════════════════════════════════

class ProjectListItem(BaseModel):
    project_id: str
    name: str
    site_url: Optional[str]
    total_tests: int
    last_score: Optional[int]
    scores: List[int]
    known_issues: List[str]
    recurring_issues: List[str]
    notes_count: int
    created_at: datetime
    updated_at: datetime


class ProjectDetailResponse(BaseModel):
    project_id: str
    name: str
    site_url: Optional[str]
    description: Optional[str]
    context: dict
    test_summary: dict
    total_tests: int
    reports: List[TestReportListItem]
    created_at: datetime
    updated_at: datetime


@router.get("/projects", response_model=List[ProjectListItem], summary="List all QA Projects")
async def list_projects(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List all QA projects for the authenticated user."""
    try:
        projects = await execute(
            """
            SELECT p.project_id, p.name, p.site_url, p.context, p.test_summary,
                   p.created_at, p.updated_at,
                   COUNT(tr.report_id) as total_tests
            FROM projects p
            LEFT JOIN test_reports tr ON tr.project_id = p.project_id
            WHERE p.account_id = :uid AND p.project_type = qa
            GROUP BY p.project_id, p.name, p.site_url, p.context, p.test_summary,
                     p.created_at, p.updated_at
            ORDER BY p.updated_at DESC
            LIMIT :lim OFFSET :off
            """,
            {"uid": user_id, "lim": limit, "off": offset}
        )

        result = []
        for p in projects:
            context = p.get("context") or {}
            summary = p.get("test_summary") or {}
            if isinstance(context, str):
                try: context = json.loads(context)
                except: context = {}
            if isinstance(summary, str):
                try: summary = json.loads(summary)
                except: summary = {}

            scores = summary.get("scores", [])
            known_issues = context.get("known_issues", [])
            recurring_issues = summary.get("recurring_issues", [])
            notes = context.get("notes", [])

            result.append(ProjectListItem(
                project_id=str(p["project_id"]),
                name=p["name"],
                site_url=p.get("site_url"),
                total_tests=p.get("total_tests", 0),
                last_score=scores[-1] if scores else None,
                scores=scores[-10:],
                known_issues=known_issues[:10],
                recurring_issues=recurring_issues[:10],
                notes_count=len(notes),
                created_at=p["created_at"],
                updated_at=p["updated_at"],
            ))

        return result
    except Exception as e:
        logger.error(f"Error listing projects: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}", response_model=ProjectDetailResponse, summary="Get Project Detail")
async def get_project_detail(
    project_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    report_limit: int = Query(50, ge=1, le=200),
):
    """Get full project detail with all test reports and accumulated knowledge."""
    try:
        project = await execute_one(
            """SELECT project_id, name, site_url, description, context, test_summary,
                      created_at, updated_at
               FROM projects WHERE project_id = :pid AND account_id = :uid""",
            {"pid": project_id, "uid": user_id}
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        context = project.get("context") or {}
        summary = project.get("test_summary") or {}
        if isinstance(context, str):
            try: context = json.loads(context)
            except: context = {}
        if isinstance(summary, str):
            try: summary = json.loads(summary)
            except: summary = {}

        # Get all reports for this project
        reports = await execute(
            """SELECT report_id, thread_id, project_id, test_url, test_type, viewport,
                      status, score, total_tests, passed, failed, warnings, created_at, updated_at
               FROM test_reports
               WHERE project_id = :pid AND account_id = :uid
               ORDER BY created_at DESC
               LIMIT :lim""",
            {"pid": project_id, "uid": user_id, "lim": report_limit}
        )

        report_list = [
            TestReportListItem(
                report_id=str(r["report_id"]),
                thread_id=str(r["thread_id"]) if r.get("thread_id") else None,
                project_id=str(r["project_id"]) if r.get("project_id") else None,
                test_url=r["test_url"],
                test_type=r["test_type"],
                viewport=r.get("viewport", "desktop"),
                status=r["status"],
                score=r.get("score"),
                total_tests=r.get("total_tests", 0),
                passed=r.get("passed", 0),
                failed=r.get("failed", 0),
                warnings=r.get("warnings", 0),
                created_at=r["created_at"],
                updated_at=r["updated_at"],
            )
            for r in reports
        ]

        return ProjectDetailResponse(
            project_id=str(project["project_id"]),
            name=project["name"],
            site_url=project.get("site_url"),
            description=project.get("description"),
            context=context,
            test_summary=summary,
            total_tests=len(report_list),
            reports=report_list,
            created_at=project["created_at"],
            updated_at=project["updated_at"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))
