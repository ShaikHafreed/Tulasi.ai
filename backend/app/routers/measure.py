import asyncio

from fastapi import APIRouter, File, UploadFile

from ..errors import AppError
from ..models.schemas import MeasurementResult
from ..services import calibrate
from ..services.uploads import validate_content_type, validate_size

router = APIRouter(prefix="/api", tags=["measure"])


@router.post("/measure", response_model=MeasurementResult)
async def measure(image: UploadFile = File(...)) -> MeasurementResult:
    validate_content_type(image.content_type)
    image_bytes = await image.read()
    validate_size(len(image_bytes))

    try:
        return await asyncio.to_thread(calibrate.measure, image_bytes)
    except ValueError:
        raise AppError(
            status_code=400,
            error_code="invalid_image",
            human_message="That photo couldn't be read.",
            suggested_action="Try a different photo.",
        )
