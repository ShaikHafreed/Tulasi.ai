from fastapi import APIRouter

from ..errors import AppError
from ..models.schemas import AssistantRequest, AssistantResponse
from ..services import assistant

router = APIRouter(prefix="/api", tags=["assistant"])


@router.post("/jobs/{job_id}/assistant", response_model=AssistantResponse)
async def ask_assistant(job_id: str, body: AssistantRequest) -> AssistantResponse:
    try:
        result = assistant.ask(job_id, body.message)
    except RuntimeError as exc:
        raise AppError(
            status_code=502,
            error_code="assistant_unavailable",
            human_message="The AI assistant isn't configured yet.",
            suggested_action="Add a real ANTHROPIC_API_KEY to backend/.env to enable it.",
        ) from exc
    return AssistantResponse(**result)
