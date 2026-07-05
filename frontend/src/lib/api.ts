import type { ErrorDetail, GenerateAccepted, JobRecord, MeasurementResult } from '@/lib/types'

class ApiError extends Error {
  detail: ErrorDetail

  constructor(detail: ErrorDetail) {
    super(detail.human_message)
    this.detail = detail
  }
}

async function parseErrorOrThrow(response: Response): Promise<never> {
  const body = await response.json().catch(() => null)
  if (body && typeof body === 'object' && 'error_code' in body) {
    throw new ApiError(body as ErrorDetail)
  }
  throw new ApiError({
    error_code: 'unknown_error',
    human_message: `Something went wrong (${response.status}).`,
    suggested_action: 'Try again in a moment.',
  })
}

export async function uploadImage(file: File): Promise<GenerateAccepted> {
  const formData = new FormData()
  formData.append('image', file)

  const response = await fetch('/api/generate', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    await parseErrorOrThrow(response)
  }

  return response.json()
}

export async function getJobStatus(jobId: string): Promise<JobRecord> {
  const response = await fetch(`/api/jobs/${jobId}`)

  if (!response.ok) {
    await parseErrorOrThrow(response)
  }

  return response.json()
}

export async function getMeasurement(jobId: string): Promise<MeasurementResult> {
  const response = await fetch(`/api/jobs/${jobId}/measure`, { method: 'POST' })

  if (!response.ok) {
    await parseErrorOrThrow(response)
  }

  return response.json()
}

export { ApiError }
