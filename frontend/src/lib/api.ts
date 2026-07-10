import { supabase } from './supabase'
import type { AssistantReply, ErrorDetail, GenerateAccepted, JobRecord, MeasurementResult } from './types'
import type { TulasiEvent } from './tulasiEvents'

export class ApiError extends Error {
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

async function authHeaders(): Promise<HeadersInit> {
  if (!supabase) return {}
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function uploadImage(file: File): Promise<GenerateAccepted> {
  const formData = new FormData()
  formData.append('image', file)

  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: await authHeaders(),
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

export async function measureImage(file: File): Promise<MeasurementResult> {
  const formData = new FormData()
  formData.append('image', file)

  const response = await fetch('/api/measure', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    await parseErrorOrThrow(response)
  }

  return response.json()
}

export async function sendAssistantMessage(message: string, events: TulasiEvent[]): Promise<AssistantReply> {
  const response = await fetch('/api/assistant/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, events }),
  })

  if (!response.ok) {
    await parseErrorOrThrow(response)
  }

  return response.json()
}

export async function sendAssistantFeedback(message: string, rating: 'up' | 'down'): Promise<void> {
  const response = await fetch('/api/assistant/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ message, rating }),
  })

  if (!response.ok) {
    await parseErrorOrThrow(response)
  }
}
