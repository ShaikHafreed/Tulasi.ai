from .models.schemas import JobRecord, JobStatus

_jobs: dict[str, JobRecord] = {}


def create(job_id: str) -> None:
    _jobs[job_id] = JobRecord(status=JobStatus.PENDING, stage="Queued")


def update(job_id: str, **fields) -> None:
    _jobs[job_id] = _jobs[job_id].model_copy(update=fields)


def get(job_id: str) -> JobRecord | None:
    return _jobs.get(job_id)
