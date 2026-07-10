from fastapi import APIRouter, Header

from .. import supabase_client
from ..errors import AppError
from ..models.schemas import AssistantFeedbackRequest, AssistantMessageRequest, AssistantReply
from ..services import assistant

router = APIRouter(prefix="/api", tags=["assistant"])


@router.post("/assistant/message", response_model=AssistantReply)
async def send_message(body: AssistantMessageRequest) -> AssistantReply:
    return assistant.get_reply(body.message, body.events)


@router.post("/assistant/feedback", status_code=204)
async def send_feedback(
    body: AssistantFeedbackRequest,
    authorization: str | None = Header(default=None),
) -> None:
    if body.rating not in ("up", "down"):
        raise AppError(
            status_code=400,
            error_code="invalid_rating",
            human_message="That feedback rating isn't valid.",
            suggested_action="",
        )

    access_token = supabase_client.bearer_token(authorization)
    if not access_token:
        raise AppError(
            status_code=401,
            error_code="not_authenticated",
            human_message="Sign in to leave feedback.",
            suggested_action="Sign in and try again.",
        )

    supabase_client.insert_assistant_feedback(access_token, message=body.message, rating=body.rating)
