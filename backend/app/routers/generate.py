import asyncio
import uuid

from fastapi import APIRouter, File, Header, UploadFile

from .. import job_store
from ..errors import AppError
from ..models.schemas import GenerateAccepted
from ..services import calibrate, meshy
from ..services.uploads import validate_content_type, validate_size
from ..supabase_client import bearer_token

router = APIRouter(prefix="/api", tags=["generate"])

_background_tasks: set[asyncio.Task] = set()

_MAX_IMAGES = 4  # Meshy's multi-image-to-3d accepts 1–4 views.

_EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
}


@router.post("/generate", status_code=202, response_model=GenerateAccepted)
async def generate(
    # Accept 1–4 photos under the "images" field. The first photo is the
    # primary — it drives calibration, the source thumbnail, and the
    # before/after slider; extras improve Meshy's multi-view geometry.
    images: list[UploadFile] = File(...),
    authorization: str | None = Header(default=None),
) -> GenerateAccepted:
    if not images:
        raise AppError(
            status_code=400,
            error_code="no_image",
            human_message="Add at least one photo.",
            suggested_action="Choose a photo and try again.",
        )
    if len(images) > _MAX_IMAGES:
        raise AppError(
            status_code=400,
            error_code="too_many_images",
            human_message=f"Up to {_MAX_IMAGES} photos per scan.",
            suggested_action=f"Remove some and keep {_MAX_IMAGES} or fewer.",
        )

    loaded: list[tuple[bytes, str]] = []
    for image in images:
        validate_content_type(image.content_type)
        data = await image.read()
        validate_size(len(data))
        loaded.append((data, image.content_type))

    job_id = uuid.uuid4().hex
    job_store.create(job_id)

    meshy.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    # First image is the primary source (photo shown in the slider / thumbnail
    # basis); the rest are kept for future calibration/reference use.
    for index, (data, content_type) in enumerate(loaded):
        ext = _EXTENSION_BY_CONTENT_TYPE[content_type]
        suffix = "_source" if index == 0 else f"_source{index + 1}"
        (meshy.STORAGE_DIR / f"{job_id}{suffix}{ext}").write_bytes(data)
        if index == 0:
            job_store.update(job_id, image_url=f"/storage/{job_id}{suffix}{ext}")

    primary_bytes = loaded[0][0]
    try:
        dimensions = await asyncio.to_thread(calibrate.measure, primary_bytes)
        job_store.update(job_id, dimensions=dimensions)
    except ValueError:
        pass  # unreadable image for CV purposes — Meshy may still handle it

    access_token = bearer_token(authorization)
    task = asyncio.create_task(meshy.process_job(job_id, loaded, access_token))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return GenerateAccepted(job_id=job_id)
