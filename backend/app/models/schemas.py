from enum import Enum

from pydantic import BaseModel


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class ErrorDetail(BaseModel):
    error_code: str
    human_message: str
    suggested_action: str


class JobRecord(BaseModel):
    status: JobStatus
    stage: str
    model_url: str | None = None
    error: ErrorDetail | None = None


class GenerateAccepted(BaseModel):
    job_id: str
