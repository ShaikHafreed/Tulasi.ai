from fastapi import APIRouter

from ..errors import AppError
from ..models.schemas import MeasurementResult
from ..services import calibrate, meshy

router = APIRouter(prefix="/api", tags=["measure"])


def _find_photo(job_id: str):
    matches = list(meshy.STORAGE_DIR.glob(f"{job_id}_photo.*"))
    return matches[0] if matches else None


@router.post("/jobs/{job_id}/measure", response_model=MeasurementResult)
async def measure_job(job_id: str) -> MeasurementResult:
    photo_path = _find_photo(job_id)
    if photo_path is None:
        raise AppError(
            status_code=404,
            error_code="photo_not_found",
            human_message="We couldn't find the original photo for this job.",
            suggested_action="Upload the photo again to generate a new model.",
        )

    try:
        result = calibrate.calibrate(photo_path.read_bytes())
    except ValueError as exc:
        raise AppError(
            status_code=502,
            error_code="calibration_failed",
            human_message="We couldn't read that photo to measure it.",
            suggested_action="Try re-uploading the photo.",
        ) from exc
    return MeasurementResult(**result)
