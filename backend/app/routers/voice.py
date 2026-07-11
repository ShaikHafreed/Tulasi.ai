import asyncio
import logging

from fastapi import APIRouter, Response

from ..errors import AppError
from ..models.schemas import SpeakRequest
from ..services import voice

logger = logging.getLogger("tulasi.voice")

router = APIRouter(prefix="/api", tags=["voice"])


@router.post("/voice/speak")
async def speak(body: SpeakRequest) -> Response:
    if not voice.consent_on_file():
        raise AppError(
            status_code=403,
            error_code="no_voice_consent",
            human_message="No voice consent is on file.",
            suggested_action="",
        )

    try:
        audio = await asyncio.to_thread(voice.synthesize, body.text)
    except Exception:
        logger.exception("voice synthesis failed")
        raise AppError(
            status_code=500,
            error_code="voice_synthesis_failed",
            human_message="Couldn't generate speech for that reply.",
            suggested_action="The caption is still shown above — try again in a moment.",
        )

    return Response(content=audio, media_type="audio/wav")
