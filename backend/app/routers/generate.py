import asyncio
import uuid

from fastapi import APIRouter, File, Header, UploadFile

from .. import job_store
from ..models.schemas import GenerateAccepted
from ..services import calibrate, meshy
from ..services.uploads import validate_content_type, validate_size

router = APIRouter(prefix="/api", tags=["generate"])

_background_tasks: set[asyncio.Task] = set()


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.removeprefix("Bearer ")


@router.post("/generate", status_code=202, response_model=GenerateAccepted)
async def generate(
    image: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> GenerateAccepted:
    validate_content_type(image.content_type)
    image_bytes = await image.read()
    validate_size(len(image_bytes))

    job_id = uuid.uuid4().hex
    job_store.create(job_id)

    try:
        dimensions = await asyncio.to_thread(calibrate.measure, image_bytes)
        job_store.update(job_id, dimensions=dimensions)
    except ValueError:
        pass  # unreadable image for CV purposes — Meshy may still handle it

    access_token = _bearer_token(authorization)
    task = asyncio.create_task(
        meshy.process_job(job_id, image_bytes, image.content_type, access_token)
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return GenerateAccepted(job_id=job_id)
