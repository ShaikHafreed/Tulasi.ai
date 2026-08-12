import { supabase } from './supabase'
import { markExported } from './onboarding'
import type {
  AnimationPreset,
  AnimationRecord,
  AssistantReply,
  ErrorDetail,
  GenerateAccepted,
  JobRecord,
  MeasurementResult,
  RigRecord,
  SharedScan,
  SubjectBox,
  RecognizeResponse,
} from './types'
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

// Every authenticated call goes through here instead of a bare fetch().
// supabase-js already refreshes the session proactively on its own timer,
// so most requests never hit this path — but a request can still land with
// a token that expired in the gap between getSession() and the server
// receiving it (or one invalidated by a sign-out in another tab). Rather
// than surface that as a user-visible error, refresh the session once and
// silently replay the exact same request — the caller never sees the 401.
async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  for (const [key, value] of Object.entries(await authHeaders())) headers.set(key, value)

  const response = await fetch(input, { ...init, headers })
  if (response.status !== 401 || !supabase) return response

  const { data, error } = await supabase.auth.refreshSession()
  if (error || !data.session) return response // refresh itself failed — surface the original 401

  headers.set('Authorization', `Bearer ${data.session.access_token}`)
  return fetch(input, { ...init, headers })
}

// Suggests a crop box around the main object in a photo, so the user can
// confirm what to model before generating.
export async function detectSubject(file: File): Promise<SubjectBox> {
  const formData = new FormData()
  formData.append('image', file)
  const response = await fetch('/api/detect-subject', { method: 'POST', body: formData })
  if (!response.ok) await parseErrorOrThrow(response)
  return response.json()
}

// Identifies the distinct object(s) in a photo (Claude vision when available;
// an OpenCV box guess in mock mode) so the user can confirm what to model.
export async function recognizeObjects(file: File): Promise<RecognizeResponse> {
  const formData = new FormData()
  formData.append('image', file)
  const response = await fetch('/api/recognize', { method: 'POST', body: formData })
  if (!response.ok) await parseErrorOrThrow(response)
  return response.json()
}

export async function uploadImages(files: File[]): Promise<GenerateAccepted> {
  const formData = new FormData()
  // 1–4 photos under the same "images" field; the first is the primary view.
  for (const file of files) formData.append('images', file)

  const response = await authedFetch('/api/generate', { method: 'POST', body: formData })

  if (!response.ok) {
    await parseErrorOrThrow(response)
  }

  return response.json()
}

// Re-run generation/calibration against an EXISTING scan's job_id — the
// backend updates that scan's row in place rather than inserting a new one.
export async function regenerateScan(jobId: string, files: File[]): Promise<GenerateAccepted> {
  const formData = new FormData()
  for (const file of files) formData.append('images', file)

  const response = await authedFetch(`/api/scans/${jobId}/regenerate`, { method: 'POST', body: formData })

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
  const response = await authedFetch('/api/assistant/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, rating }),
  })

  if (!response.ok) {
    await parseErrorOrThrow(response)
  }
}

export async function speakText(text: string): Promise<Blob> {
  const response = await fetch('/api/voice/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  if (!response.ok) {
    await parseErrorOrThrow(response)
  }

  return response.blob()
}

export async function listAnimationPresets(): Promise<AnimationPreset[]> {
  const response = await fetch('/api/character/presets')
  if (!response.ok) {
    await parseErrorOrThrow(response)
  }
  return response.json()
}

export async function startRigging(jobId: string, heightMeters = 1.7): Promise<{ rig_id: string }> {
  const response = await fetch('/api/character/rig', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, height_meters: heightMeters }),
  })
  if (!response.ok) {
    await parseErrorOrThrow(response)
  }
  return response.json()
}

export async function getRigStatus(rigId: string): Promise<RigRecord> {
  const response = await fetch(`/api/character/rig/${rigId}`)
  if (!response.ok) {
    await parseErrorOrThrow(response)
  }
  return response.json()
}

export async function startAnimation(rigId: string, actionId: number): Promise<{ animation_id: string }> {
  const response = await fetch('/api/character/animate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rig_id: rigId, action_id: actionId }),
  })
  if (!response.ok) {
    await parseErrorOrThrow(response)
  }
  return response.json()
}

export async function getAnimationStatus(animationId: string): Promise<AnimationRecord> {
  const response = await fetch(`/api/character/animate/${animationId}`)
  if (!response.ok) {
    await parseErrorOrThrow(response)
  }
  return response.json()
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export async function uploadThumbnail(jobId: string, dataUrl: string): Promise<void> {
  const formData = new FormData()
  formData.append('image', dataUrlToBlob(dataUrl), 'thumbnail.jpg')

  const response = await authedFetch(`/api/scans/${jobId}/thumbnail`, { method: 'POST', body: formData })

  if (!response.ok) {
    await parseErrorOrThrow(response)
  }
}

export async function renameScan(jobId: string, objectName: string): Promise<void> {
  const response = await authedFetch(`/api/scans/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ object_name: objectName }),
  })
  if (!response.ok) await parseErrorOrThrow(response)
}

export async function deleteScan(jobId: string): Promise<void> {
  const response = await authedFetch(`/api/scans/${jobId}`, { method: 'DELETE' })

  if (!response.ok) {
    await parseErrorOrThrow(response)
  }
}

export async function enableShare(jobId: string): Promise<string> {
  const response = await authedFetch(`/api/scans/${jobId}/share`, { method: 'POST' })
  if (!response.ok) await parseErrorOrThrow(response)
  const body = (await response.json()) as { slug: string }
  return body.slug
}

export async function disableShare(jobId: string): Promise<void> {
  const response = await authedFetch(`/api/scans/${jobId}/share`, { method: 'DELETE' })
  if (!response.ok) await parseErrorOrThrow(response)
}

// Public — no auth header, used by the /share/{slug} page.
export async function getSharedScan(slug: string): Promise<SharedScan> {
  const response = await fetch(`/api/share/${slug}`)
  if (!response.ok) await parseErrorOrThrow(response)
  return response.json()
}

export interface ExportDimensions {
  width_mm: number
  height_mm: number
  depth_mm: number
}

export interface EstimateResult {
  volume_cm3: number
  weight_g: number
  material: string
  density_g_cm3: number
}

// Real mesh-volume weight estimate (trimesh divergence-theorem volume over
// the actual scaled mesh, not a bounding-box guess). Cost is computed
// client-side from weight_g * a user-editable price/gram, since that price
// is a local preference, not something the backend needs to know.
export async function estimateScan(
  jobId: string,
  dims: ExportDimensions,
  material: string,
): Promise<EstimateResult> {
  const response = await fetch(`/api/scans/${jobId}/estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...dims, material }),
  })
  if (!response.ok) await parseErrorOrThrow(response)
  return response.json()
}

// Downloads the model scaled to its real millimeter dimensions. STL drops
// straight into a slicer at the correct size; GLB keeps materials for web use.
export async function exportScan(
  jobId: string,
  format: 'stl' | 'glb',
  dims: ExportDimensions,
): Promise<void> {
  const response = await fetch(`/api/scans/${jobId}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, ...dims }),
  })

  if (!response.ok) {
    await parseErrorOrThrow(response)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `tulasi-${jobId}.${format}`
  link.click()
  URL.revokeObjectURL(url)
  markExported()
}
