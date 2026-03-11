"""
QA Testing API endpoints for Breakit.
Connects the test input form to the agent pipeline with QA-specific prompts.
"""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl

from core.agents.api import start_agent_run
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.prompts.qa_testing_prompt import QA_TESTING_SYSTEM_PROMPT
from core.prompts.test_templates import (
    FULL_AUDIT, SIGNUP_FLOW, CHECKOUT_FLOW, FORM_VALIDATION, RESPONSIVE_CHECK
)

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


class StartTestResponse(BaseModel):
    thread_id: str
    project_id: str
    agent_run_id: str


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
    project_id = str(uuid.uuid4())
    
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
        
        return StartTestResponse(
            thread_id=result["thread_id"],
            project_id=result["project_id"],
            agent_run_id=result["agent_run_id"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start test: {str(e)}")
