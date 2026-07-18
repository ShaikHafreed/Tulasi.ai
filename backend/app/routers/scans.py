import logging

from fastapi import APIRouter, File, Header, Response, UploadFile

from .. import supabase_client
from ..errors import AppError
from ..models.schemas import ExportRequest
from ..services import exporter
from ..services.meshy import STORAGE_DIR
from ..services.uploads import validate_content_type, validate_size

logger = logging.getLogger("tulasi.scans")

router = APIRouter(prefix="/api/scans", tags=["scans"])


def _require_access_token(authorization: str | None) -> str:
    access_token = supabase_client.bearer_token(authorization)
    if not access_token:
        raise AppError(
            status_code=401,
            error_code="not_authenticated",
            human_message="Sign in to manage scans.",
            suggested_action="Sign in and try again.",
        )
    return access_token


@router.post("/{job_id}/thumbnail", status_code=204)
async def upload_thumbnail(
    job_id: str,
    image: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> None:
    access_token = _require_access_token(authorization)

    validate_content_type(image.content_type)
    image_bytes = await image.read()
    validate_size(len(image_bytes))

    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    dest = STORAGE_DIR / f"{job_id}_thumb.jpg"
    dest.write_bytes(image_bytes)

    try:
        supabase_client.update_scan_image(access_token, job_id=job_id, image_url=f"/storage/{job_id}_thumb.jpg")
    except Exception:
        # The thumbnail file is saved either way — a stale Library row until
        # next refresh isn't worth failing the request over.
        logger.exception("scan image update failed for job %s", job_id)


@router.post("/{job_id}/export")
async def export_scan(job_id: str, body: ExportRequest) -> Response:
    # No auth: this only reads a local storage file and returns it, same as
    # the public /storage mount — gating it would be inconsistent.
    data, filename, content_type = exporter.build_export(
        job_id,
        body.format.lower(),
        body.width_mm,
        body.height_mm,
        body.depth_mm,
    )
    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{job_id}", status_code=204)
async def delete_scan(job_id: str, authorization: str | None = Header(default=None)) -> None:
    access_token = _require_access_token(authorization)

    try:
        supabase_client.delete_scan(access_token, job_id=job_id)
    except Exception:
        logger.exception("scan delete failed for job %s", job_id)
        raise AppError(
            status_code=500,
            error_code="delete_failed",
            human_message="Couldn't delete that scan.",
            suggested_action="Try again in a moment.",
        )

    for suffix in (".glb", "_source.jpg", "_source.png", "_thumb.jpg"):
        path = STORAGE_DIR / f"{job_id}{suffix}"
        if path.exists():
            path.unlink()
