export type JobStatusValue = 'pending' | 'processing' | 'succeeded' | 'failed'
export type ReferenceType = 'card' | 'coin' | 'none'

export interface ErrorDetail {
  error_code: string
  human_message: string
  suggested_action: string
}

export interface MeasurementResult {
  width_mm: number | null
  height_mm: number | null
  depth_mm: number | null
  depth_estimated: boolean
  reference_type: ReferenceType
  reference_confidence: number
}

export interface JobRecord {
  status: JobStatusValue
  stage: string
  model_url: string | null
  image_url: string | null
  error: ErrorDetail | null
  dimensions: MeasurementResult | null
  meshy_task_id: string | null
}

export interface AnimationPreset {
  action_id: number
  name: string
  label: string
}

export interface RigRecord {
  status: JobStatusValue
  rigged_model_url: string | null
  walking_url: string | null
  running_url: string | null
  error: ErrorDetail | null
}

export interface AnimationRecord {
  status: JobStatusValue
  animation_url: string | null
  error: ErrorDetail | null
}

export interface GenerateAccepted {
  job_id: string
}

export interface ProposedAction {
  action: string
  params: Record<string, unknown>
  reversible: boolean
}

export interface Source {
  title: string
  url: string
}

export interface AssistantReply {
  reply: string
  proposed_actions: ProposedAction[]
  sources: Source[]
}

export interface Scan {
  id: string
  user_id: string
  job_id: string
  object_name: string | null
  model_url: string | null
  image_url: string | null
  // The original uploaded photo, kept even after image_url is overwritten with
  // the 3D render — powers the before/after slider. Null for scans created
  // before this column existed.
  source_image_url: string | null
  width_mm: number | null
  height_mm: number | null
  depth_mm: number | null
  depth_estimated: boolean
  created_at: string
  // Unguessable slug when the scan is shared read-only; null when private.
  share_slug: string | null
}

// Normalised suggested crop box (0..1) around the main object.
export interface SubjectBox {
  x: number
  y: number
  w: number
  h: number
  confident: boolean
}

export interface RecognizedObject {
  // label/description are null when the object couldn't be identified (mock /
  // no Claude credit) — the box is still a real guess.
  label: string | null
  description: string | null
  box: SubjectBox
  confidence: number
}

export interface RecognizeResponse {
  objects: RecognizedObject[]
}

export interface SharedScan {
  object_name: string | null
  model_url: string | null
  width_mm: number | null
  height_mm: number | null
  depth_mm: number | null
  depth_estimated: boolean
}
