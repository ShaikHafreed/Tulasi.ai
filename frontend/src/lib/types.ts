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

export interface AssistantReply {
  reply: string
  proposed_actions: ProposedAction[]
}

export interface Scan {
  id: string
  user_id: string
  job_id: string
  object_name: string | null
  model_url: string | null
  image_url: string | null
  width_mm: number | null
  height_mm: number | null
  depth_mm: number | null
  depth_estimated: boolean
  created_at: string
}
