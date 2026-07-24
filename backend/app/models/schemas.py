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


class ExportRequest(BaseModel):
    # "stl" (3D-printing standard) or "glb". Dimensions are the real measured/
    # edited mm; when all three are present the mesh is scaled so its bounding
    # box matches them. Omit them to export at the model's own scale.
    format: str = "stl"
    width_mm: float | None = None
    height_mm: float | None = None
    depth_mm: float | None = None


class RenameScanRequest(BaseModel):
    object_name: str


class EstimateRequest(BaseModel):
    width_mm: float
    height_mm: float
    depth_mm: float
    material: str = "pla"


class EstimateResponse(BaseModel):
    volume_cm3: float
    weight_g: float
    material: str
    density_g_cm3: float


class SubjectBox(BaseModel):
    # Normalised (0..1) suggested crop around the main object; `confident` is
    # False when it's just a centred fallback.
    x: float
    y: float
    w: float
    h: float
    confident: bool


class RecognizedObject(BaseModel):
    # label/description are None when we can't actually identify the object
    # (mock mode / no Claude credit) — we never invent a label. box is the
    # normalised region; confidence is 0..1.
    label: str | None = None
    description: str | None = None
    box: SubjectBox
    confidence: float


class RecognizeResponse(BaseModel):
    objects: list[RecognizedObject]


class ShareResponse(BaseModel):
    slug: str


class SharedScan(BaseModel):
    object_name: str | None = None
    model_url: str | None = None
    width_mm: float | None = None
    height_mm: float | None = None
    depth_mm: float | None = None
    depth_estimated: bool = True
