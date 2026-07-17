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
    image_url: str | None = None
    error: ErrorDetail | None = None
    dimensions: MeasurementResult | None = None
    meshy_task_id: str | None = None


class GenerateAccepted(BaseModel):
    job_id: str


class RigRequest(BaseModel):
    job_id: str
    height_meters: float = 1.7


class RigAccepted(BaseModel):
    rig_id: str


class RigRecord(BaseModel):
    status: JobStatus
    rigged_model_url: str | None = None
    walking_url: str | None = None
    running_url: str | None = None
    meshy_rig_task_id: str | None = None
    error: ErrorDetail | None = None


class AnimatePresetRequest(BaseModel):
    rig_id: str
    action_id: int


class AnimateAccepted(BaseModel):
    animation_id: str


class AnimationRecord(BaseModel):
    status: JobStatus
    animation_url: str | None = None
    error: ErrorDetail | None = None


class AnimationPreset(BaseModel):
    action_id: int
    name: str
    label: str


class TulasiEvent(BaseModel):
    type: str
    payload: dict | None = None
    at: int


class AssistantMessageRequest(BaseModel):
    message: str
    events: list[TulasiEvent] = []


class ProposedAction(BaseModel):
    action: str
    params: dict
    reversible: bool


class Source(BaseModel):
    title: str
    url: str


class AssistantReply(BaseModel):
    reply: str
    proposed_actions: list[ProposedAction] = []
    sources: list[Source] = []


class AssistantFeedbackRequest(BaseModel):
    message: str
    rating: str


class SpeakRequest(BaseModel):
    text: str
