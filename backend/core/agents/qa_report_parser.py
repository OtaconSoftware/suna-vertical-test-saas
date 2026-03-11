"""
QA Report Parser
Parses QA test agent output to extract structured test results.
Monitors agent_runs for completion and updates test_reports accordingly.
"""
import re
from typing import Optional, List, Dict, Any
from core.services.db import execute_one, execute_mutate
from core.utils.logger import logger


async def parse_qa_report(raw_text: str) -> Optional[Dict[str, Any]]:
    """
    Parse QA report text between ---QA_REPORT_START--- and ---QA_REPORT_END--- markers.

    Returns structured data:
    {
        "total_tests": int,
        "passed": int,
        "failed": int,
        "warnings": int,
        "score": int,  # 0-100
        "bugs": [
            {
                "name": str,
                "status": "PASS" | "FAIL" | "WARNING",
                "severity": "Critical" | "High" | "Medium" | "Low",
                "description": str,
                "expected": str,
                "actual": str,
                "screenshot_url": Optional[str]
            }
        ]
    }
    """
    if not raw_text:
        return None

    # Extract content between markers
    match = re.search(
        r'---QA_REPORT_START---(.*?)---QA_REPORT_END---',
        raw_text,
        re.DOTALL
    )

    if not match:
        logger.debug("No QA report markers found in text")
        return None

    report_content = match.group(1)

    # Parse summary section
    total_tests = 0
    passed = 0
    failed = 0
    warnings = 0

    summary_match = re.search(r'## Test Summary(.*?)(?=##|\Z)', report_content, re.DOTALL)
    if summary_match:
        summary_text = summary_match.group(1)

        total_match = re.search(r'-\s*Total Tests:\s*(\d+)', summary_text, re.IGNORECASE)
        if total_match:
            total_tests = int(total_match.group(1))

        passed_match = re.search(r'-\s*Passed:\s*(\d+)', summary_text, re.IGNORECASE)
        if passed_match:
            passed = int(passed_match.group(1))

        failed_match = re.search(r'-\s*Failed:\s*(\d+)', summary_text, re.IGNORECASE)
        if failed_match:
            failed = int(failed_match.group(1))

        warnings_match = re.search(r'-\s*Warnings:\s*(\d+)', summary_text, re.IGNORECASE)
        if warnings_match:
            warnings = int(warnings_match.group(1))

    # Calculate score
    score = round((passed / total_tests * 100)) if total_tests > 0 else 0

    # Parse individual test results
    bugs = []
    results_match = re.search(r'## Test Results(.*)', report_content, re.DOTALL)
    if results_match:
        results_text = results_match.group(1)

        # Split by test headers (### Test:)
        test_blocks = re.split(r'### Test:', results_text)

        for block in test_blocks[1:]:  # Skip first empty split
            bug = {}

            # Extract test name (first line)
            name_match = re.match(r'([^\n]+)', block)
            if name_match:
                bug['name'] = name_match.group(1).strip()

            # Extract status
            status_match = re.search(r'\*\*Status\*\*:\s*(PASS|FAIL|WARNING)', block, re.IGNORECASE)
            if status_match:
                bug['status'] = status_match.group(1).upper()

            # Extract severity
            severity_match = re.search(r'\*\*Severity\*\*:\s*(Critical|High|Medium|Low)', block, re.IGNORECASE)
            if severity_match:
                bug['severity'] = severity_match.group(1).capitalize()

            # Extract description
            desc_match = re.search(r'\*\*Description\*\*:\s*([^\n]+)', block)
            if desc_match:
                bug['description'] = desc_match.group(1).strip()

            # Extract expected
            expected_match = re.search(r'\*\*Expected\*\*:\s*([^\n]+)', block)
            if expected_match:
                bug['expected'] = expected_match.group(1).strip()

            # Extract actual
            actual_match = re.search(r'\*\*Actual\*\*:\s*([^\n]+)', block)
            if actual_match:
                bug['actual'] = actual_match.group(1).strip()

            # Extract screenshot URL
            screenshot_match = re.search(r'\*\*Screenshot\*\*:\s*([^\n]+)', block)
            if screenshot_match:
                screenshot_text = screenshot_match.group(1).strip()
                if screenshot_text and screenshot_text.lower() not in ['n/a', 'none', '-']:
                    bug['screenshot_url'] = screenshot_text
                else:
                    bug['screenshot_url'] = None
            else:
                bug['screenshot_url'] = None

            if bug.get('name'):
                bugs.append(bug)

    return {
        "total_tests": total_tests,
        "passed": passed,
        "failed": failed,
        "warnings": warnings,
        "score": score,
        "bugs": bugs
    }


async def update_test_report_from_thread(thread_id: str) -> bool:
    """
    Fetch messages from a thread, parse QA report, and update test_reports row.
    Called when an agent_run completes.

    Returns True if report was found and updated, False otherwise.
    """
    try:
        # Find test_report for this thread
        report = await execute_one(
            "SELECT report_id FROM test_reports WHERE thread_id = :thread_id AND status = 'running'",
            {"thread_id": thread_id}
        )

        if not report:
            logger.debug(f"No running test report found for thread {thread_id}")
            return False

        report_id = report["report_id"]

        # Fetch all assistant messages from thread
        messages = await execute_one(
            """
            SELECT string_agg(content, E'\n\n' ORDER BY created_at) as full_content
            FROM messages
            WHERE thread_id = :thread_id AND role = 'assistant'
            """,
            {"thread_id": thread_id}
        )

        if not messages or not messages.get("full_content"):
            logger.debug(f"No messages found for thread {thread_id}")
            # Mark as failed since no output
            await execute_mutate(
                "UPDATE test_reports SET status = 'failed' WHERE report_id = :report_id",
                {"report_id": report_id}
            )
            return False

        full_text = messages["full_content"]

        # Parse the report
        parsed = await parse_qa_report(full_text)

        if not parsed:
            logger.debug(f"Could not parse QA report from thread {thread_id}")
            # Mark as completed but without parsed data
            await execute_mutate(
                """
                UPDATE test_reports
                SET status = 'completed', raw_report = :raw_report
                WHERE report_id = :report_id
                """,
                {"report_id": report_id, "raw_report": full_text}
            )
            return False

        # Update test_reports with parsed data
        await execute_mutate(
            """
            UPDATE test_reports
            SET
                status = 'completed',
                score = :score,
                total_tests = :total_tests,
                passed = :passed,
                failed = :failed,
                warnings = :warnings,
                bugs = :bugs::jsonb,
                raw_report = :raw_report
            WHERE report_id = :report_id
            """,
            {
                "report_id": report_id,
                "score": parsed["score"],
                "total_tests": parsed["total_tests"],
                "passed": parsed["passed"],
                "failed": parsed["failed"],
                "warnings": parsed["warnings"],
                "bugs": parsed["bugs"],
                "raw_report": full_text
            }
        )

        logger.info(f"Successfully updated test report {report_id} from thread {thread_id}")
        return True

    except Exception as e:
        logger.error(f"Error updating test report from thread {thread_id}: {str(e)}")
        return False


async def process_completed_agent_run(agent_run_id: str, thread_id: str) -> None:
    """
    Called when an agent_run completes. Checks if it's a QA test and updates report.
    This should be integrated into the agent completion webhook/callback.
    """
    try:
        # Check if this is a QA test run by checking metadata or test_reports table
        report_exists = await execute_one(
            "SELECT report_id FROM test_reports WHERE thread_id = :thread_id",
            {"thread_id": thread_id}
        )

        if report_exists:
            logger.info(f"Agent run {agent_run_id} completed - processing QA report for thread {thread_id}")
            await update_test_report_from_thread(thread_id)

    except Exception as e:
        logger.error(f"Error processing completed agent run {agent_run_id}: {str(e)}")
