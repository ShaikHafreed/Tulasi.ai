import asyncio
import uuid

from fastapi import APIRouter, File, UploadFile

from .. import job_store
from ..errors import AppError
from ..models.schemas import GenerateAccepted
from ..services import meshy

router = APIRouter(prefix="/api", tags=["generate"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png"}
MAX_BYTES = 10 * 1024 * 1024

_background_tasks: set[asyncio.Task] = set()


@router.post("/generate", status_code=202, response_model=GenerateAccepted)
async def generate(image: UploadFile = File(...)) -> GenerateAccepted:
    if image.content_type not in ALLOWED_CONTENT_TYPES:
        raise AppError(
            status_code=400,
            error_code="unsupported_file_type",
            human_message="Only JPEG or PNG photos are supported.",
            suggested_action="Upload a .jpg or .png photo of the object.",
        )

    image_bytes = await image.read()
    if len(image_bytes) > MAX_BYTES:
        raise AppError(
            status_code=400,
            error_code="file_too_large",
            human_message="That photo is too large.",
            suggested_action="Upload a photo under 10MB.",
        )

    job_id = uuid.uuid4().hex
    job_store.create(job_id)

    task = asyncio.create_task(meshy.process_job(job_id, image_bytes, image.content_type))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return GenerateAccepted(job_id=job_id)
