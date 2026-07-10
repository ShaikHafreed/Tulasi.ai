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


class ReferenceType(str, Enum):
    CARD = "card"
    COIN = "coin"
    NONE = "none"


class MeasurementResult(BaseModel):
    width_mm: float | None
    height_mm: float | None
    depth_mm: float | None
    depth_estimated: bool
    reference_type: ReferenceType
    reference_confidence: float


class JobRecord(BaseModel):
    status: JobStatus
    stage: str
    model_url: str | None = None
    error: ErrorDetail | None = None
    dimensions: MeasurementResult | None = None


class GenerateAccepted(BaseModel):
    job_id: str
