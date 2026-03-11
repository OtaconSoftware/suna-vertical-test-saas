"""
QA Testing API endpoints for Breakit.
Connects the test input form to the agent pipeline with QA-specific prompts.
"""
import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, HttpUrl
from datetime import datetime

from core.agents.api import start_agent_run
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.prompts.qa_testing_prompt import QA_TESTING_SYSTEM_PROMPT
from core.prompts.test_templates import (
    FULL_AUDIT, SIGNUP_FLOW, CHECKOUT_FLOW, FORM_VALIDATION, RESPONSIVE_CHECK
)
from core.services.db import execute, execute_one, execute_mutate

router = APIRouter(prefix="/qa", tags=["QA Testing"])

TEMPLATE_MAP = {
    "full-audit": FULL_AUDIT,
    "signup-flow": SIGNUP_FLOW,
    "checkout-flow": CHECKOUT_FLOW,
    "form-validation": FORM_VALIDATION,
    "responsive-check": RESPONSIVE_CHECK,
}


class TestCredentials(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None


class StartTestRequest(BaseModel):
    url: str
    test_type: str  # "full-audit", "signup-flow", "checkout-flow", "form-validation", "responsive-check", "custom"
    specs: Optional[str] = None
    viewport: str = "desktop"  # "desktop", "mobile", "both"
    credentials: Optional[TestCredentials] = None
    project_id: Optional[str] = None  # Optional project to associate test with


class StartTestResponse(BaseModel):
    thread_id: str
    project_id: str
    agent_run_id: str
    report_id: str  # ID of the created test_reports row


@router.post("/start-test", response_model=StartTestResponse, summary="Start QA Test")
async def start_qa_test(
    request: StartTestRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Start an AI-powered QA test on a URL."""
    
    # Build the prompt
    prompt_parts = []
    
    # Add test URL
    prompt_parts.append(f"# QA Test Request\n\n**Target URL:** {request.url}")
    
    # Add template instructions if not custom
    template = TEMPLATE_MAP.get(request.test_type)
    if template:
        prompt_parts.append(f"\n## Test Type: {template['name']}\n{template['system_prompt_addition']}")
        prompt_parts.append(f"\n**Steps hint:** {template['steps_hint']}")
    elif request.test_type == "custom":
        if not request.specs:
            raise HTTPException(status_code=400, detail="specs required for custom test type")
    
    # Add user specs
    if request.specs:
        prompt_parts.append(f"\n## Additional Test Specifications\n{request.specs}")
    
    # Add viewport info
    viewport_instructions = {
        "desktop": "Test at desktop viewport (1280px width).",
        "mobile": "Test at mobile viewport (375px width).",
        "both": "Test at both mobile (375px) and desktop (1280px) viewports. Run each test at both sizes.",
    }
    prompt_parts.append(f"\n## Viewport\n{viewport_instructions.get(request.viewport, viewport_instructions['desktop'])}")
    
    # Add credentials if provided
    if request.credentials and (request.credentials.email or request.credentials.password):
        prompt_parts.append(
            f"\n## Test Credentials\n"
            f"Use these credentials when login/signup is needed:\n"
            f"- Email: {request.credentials.email or 'N/A'}\n"
            f"- Password: {request.credentials.password or 'N/A'}"
        )
    
    # Add report format instruction
    prompt_parts.append(
        "\n## Output Format\n"
        "At the end of testing, provide a structured summary in this EXACT format:\n\n"
        "---QA_REPORT_START---\n"
        "## Test Summary\n"
        "- Total Tests: [number]\n"
        "- Passed: [number]\n"
        "- Failed: [number]\n"
        "- Warnings: [number]\n\n"
        "## Test Results\n\n"
        "For each test:\n"
        "### Test: [Test Name]\n"
        "**Status**: PASS | FAIL | WARNING\n"
        "**Severity**: Critical | High | Medium | Low\n"
        "**Description**: [what was tested]\n"
        "**Expected**: [what should happen]\n"
        "**Actual**: [what actually happened]\n"
        "**Screenshot**: [screenshot reference if taken]\n\n"
        "---QA_REPORT_END---"
    )
    
    combined_prompt = "\n".join(prompt_parts)

    # Start the agent run with QA system prompt injected via metadata
    project_id = request.project_id or str(uuid.uuid4())

    try:
        result = await start_agent_run(
            account_id=user_id,
            prompt=combined_prompt,
            model_name="kortix/basic",
            project_id=project_id,
            metadata={
                "qa_test": True,
                "test_type": request.test_type,
                "test_url": request.url,
                "viewport": request.viewport,
                "custom_system_prompt": QA_TESTING_SYSTEM_PROMPT,
            },
        )

        # Create test_reports row with status=running
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
                "project_id": project_id if request.project_id else None,
                "account_id": user_id,
                "test_url": request.url,
                "test_type": request.test_type,
                "viewport": request.viewport,
            }
        )

        return StartTestResponse(
            thread_id=result["thread_id"],
            project_id=result["project_id"],
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
    project_id: Optional[str] = None  # Can be UUID string or null to unassign


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
            SELECT
                report_id, thread_id, project_id, test_url, test_type,
                viewport, status, score, total_tests, passed, failed,
                warnings, created_at, updated_at
            FROM test_reports
            WHERE account_id = :account_id
        """
        params = {"account_id": user_id, "limit": limit, "offset": offset}

        if project_id:
            query += " AND project_id = :project_id"
            params["project_id"] = project_id

        query += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset"

        rows = await execute(query, params)

        return [
            TestReportListItem(
                report_id=str(row["report_id"]),
                thread_id=str(row["thread_id"]) if row["thread_id"] else None,
                project_id=str(row["project_id"]) if row["project_id"] else None,
                test_url=row["test_url"],
                test_type=row["test_type"],
                viewport=row["viewport"],
                status=row["status"],
                score=row["score"],
                total_tests=row["total_tests"],
                passed=row["passed"],
                failed=row["failed"],
                warnings=row["warnings"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in rows
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
            """
            SELECT
                report_id, thread_id, project_id, account_id, test_url,
                test_type, viewport, status, score, total_tests, passed,
                failed, warnings, bugs, raw_report, created_at, updated_at
            FROM test_reports
            WHERE report_id = :report_id AND account_id = :account_id
            """,
            {"report_id": report_id, "account_id": user_id}
        )

        if not row:
            raise HTTPException(status_code=404, detail="Test report not found")

        return TestReportDetail(
            report_id=str(row["report_id"]),
            thread_id=str(row["thread_id"]) if row["thread_id"] else None,
            project_id=str(row["project_id"]) if row["project_id"] else None,
            account_id=str(row["account_id"]),
            test_url=row["test_url"],
            test_type=row["test_type"],
            viewport=row["viewport"],
            status=row["status"],
            score=row["score"],
            total_tests=row["total_tests"],
            passed=row["passed"],
            failed=row["failed"],
            warnings=row["warnings"],
            bugs=row["bugs"] or [],
            raw_report=row["raw_report"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
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
        # Verify report exists and belongs to user
        existing = await execute_one(
            "SELECT report_id FROM test_reports WHERE report_id = :report_id AND account_id = :account_id",
            {"report_id": report_id, "account_id": user_id}
        )

        if not existing:
            raise HTTPException(status_code=404, detail="Test report not found")

        # Update project_id
        await execute_mutate(
            "UPDATE test_reports SET project_id = :project_id WHERE report_id = :report_id",
            {"report_id": report_id, "project_id": request.project_id}
        )

        return {"message": "Report updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update report: {str(e)}")
