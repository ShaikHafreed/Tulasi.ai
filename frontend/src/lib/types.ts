export type JobStatusValue = 'pending' | 'processing' | 'succeeded' | 'failed'

export interface ErrorDetail {
  error_code: string
  human_message: string
  suggested_action: string
}

export interface JobRecord {
  status: JobStatusValue
  stage: string
  model_url: string | null
  error: ErrorDetail | null
}

export interface GenerateAccepted {
  job_id: string
}

export interface Scan {
  id: string
  user_id: string
  job_id: string
  object_name: string | null
  model_url: string | null
  width_mm: number | null
  height_mm: number | null
  depth_mm: number | null
  depth_estimated: boolean
  created_at: string
}
