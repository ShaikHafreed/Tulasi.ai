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
