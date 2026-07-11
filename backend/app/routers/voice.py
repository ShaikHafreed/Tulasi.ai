from fastapi import APIRouter, Response

from ..errors import AppError
from ..models.schemas import SpeakRequest
from ..services import voice

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

    audio = voice.synthesize(body.text)
    return Response(content=audio, media_type="audio/wav")
