import asyncio

from fastapi import APIRouter, File, UploadFile

from ..models.schemas import RecognizeResponse
from ..services import recognize as recognize_service
from ..services.uploads import validate_content_type, validate_size

router = APIRouter(prefix="/api", tags=["recognize"])


@router.post("/recognize", response_model=RecognizeResponse)
async def recognize_objects(image: UploadFile = File(...)) -> RecognizeResponse:
    # No auth, no job — pure analysis of the posted image so the user can
    # confirm which object to model before generating.
    validate_content_type(image.content_type)
    data = await image.read()
    validate_size(len(data))
    return await asyncio.to_thread(recognize_service.recognize, data, image.content_type)
