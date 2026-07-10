from fastapi import APIRouter

from .. import job_store
from ..errors import AppError
from ..models.schemas import JobRecord

router = APIRouter(prefix="/api", tags=["jobs"])


@router.get("/jobs/{job_id}", response_model=JobRecord)
async def get_job(job_id: str) -> JobRecord:
    record = job_store.get(job_id)
    if record is None:
        raise AppError(
            status_code=404,
            error_code="job_not_found",
            human_message="We couldn't find that job.",
            suggested_action="Start a new upload.",
        )
    return record
