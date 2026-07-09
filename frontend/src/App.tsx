import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import UploadZone from './components/UploadZone'
import ProgressStages from './components/ProgressStages'
import ModelViewer, { type ModelViewerHandle } from './components/ModelViewer'
import DimensionPanel from './components/DimensionPanel'
import AssistantChat from './components/AssistantChat'
import AuthPanel from './components/AuthPanel'
import ObjectLibrary, { SaveScanButton } from './components/ObjectLibrary'
import ErrorCard from './components/ErrorCard'
import { Button } from './components/ui/button'
import { ApiError, getJobStatus, getMeasurement, uploadImage } from './lib/api'
import { useHandGestures } from './hooks/useHandGestures'
import { supabase } from './lib/supabase'
import type { AssistantAction, ErrorDetail, JobRecord, MeasurementResult } from './lib/types'

type Phase = 'idle' | 'uploading' | 'job' | 'done'

const POLL_INTERVAL_MS = 1000

const UNKNOWN_ERROR: ErrorDetail = {
  error_code: 'unknown_error',
  human_message: 'Lost connection to the server.',
  suggested_action: 'Check the backend is running and try again.',
}

function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<JobRecord | null>(null)
  const [measurement, setMeasurement] = useState<MeasurementResult | null>(null)
  const [error, setError] = useState<ErrorDetail | null>(null)
  const [gesturesEnabled, setGesturesEnabled] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const pollHandle = useRef<number | null>(null)
  const modelViewerRef = useRef<ModelViewerHandle>(null)
  const { gestureRef, error: gestureError } = useHandGestures(gesturesEnabled)

  useEffect(() => {
    return () => {
      if (pollHandle.current !== null) clearInterval(pollHandle.current)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => subscription.subscription.unsubscribe()
  }, [])

  const reset = useCallback(() => {
    if (pollHandle.current !== null) clearInterval(pollHandle.current)
    setPhase('idle')
    setJobId(null)
    setJob(null)
    setMeasurement(null)
    setError(null)
  }, [])

  useEffect(() => {
    if (phase !== 'done' || !jobId) return

    let cancelled = false
    getMeasurement(jobId)
      .then((result) => {
        if (!cancelled) setMeasurement(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.detail : UNKNOWN_ERROR)
      })

    return () => {
      cancelled = true
    }
  }, [phase, jobId])

  const handleFileSelected = useCallback(async (file: File) => {
    setPhase('uploading')
    setError(null)
    setJob(null)
    setMeasurement(null)

    try {
      const { job_id: newJobId } = await uploadImage(file)
      setJobId(newJobId)
      setPhase('job')

      pollHandle.current = window.setInterval(async () => {
        try {
          const record = await getJobStatus(newJobId)
          setJob(record)

          if (record.status === 'succeeded') {
            clearInterval(pollHandle.current!)
            setPhase('done')
          } else if (record.status === 'failed') {
            clearInterval(pollHandle.current!)
            setError(record.error ?? UNKNOWN_ERROR)
            setPhase('idle')
          }
        } catch (err) {
          clearInterval(pollHandle.current!)
          setError(err instanceof ApiError ? err.detail : UNKNOWN_ERROR)
          setPhase('idle')
        }
      }, POLL_INTERVAL_MS)
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : UNKNOWN_ERROR)
      setPhase('idle')
    }
  }, [])

  const handleValidationError = useCallback((message: string) => {
    setError({
      error_code: 'client_validation',
      human_message: message,
      suggested_action: 'Choose a different photo.',
    })
  }, [])

  const handleAssistantActions = useCallback((actions: AssistantAction[]) => {
    for (const action of actions) {
      if (action.type === 'set_dimensions') {
        setMeasurement((prev) => (prev ? { ...prev, ...action.payload } : prev))
      } else if (action.type === 'rotate_view') {
        const yaw = Number(action.payload.yaw_degrees ?? 0)
        const pitch = Number(action.payload.pitch_degrees ?? 0)
        modelViewerRef.current?.orbitBy(yaw, pitch)
      }
    }
  }, [])

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center gap-8 px-6 py-16">
      <div className="flex w-full justify-end">
        <AuthPanel session={session} />
      </div>

      <div className="text-center">
        <h1 className="text-3xl font-semibold text-slate-50">Tulasi.ai — photo to 3D</h1>
        <p className="mt-2 text-base text-teal-300">
          Meshy makes it look right. Tulasi makes it <span className="font-semibold">FIT</span> right.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Upload a photo of any object and get an editable 3D model with real-world measurements —
          no 3D modeling skill required.
        </p>
      </div>

      {phase === 'idle' && (
        <dl className="grid w-full grid-cols-1 gap-4 text-left sm:grid-cols-2">
          {[
            {
              title: 'Reference-object calibration',
              body: 'Photograph the object next to a card or coin and every dimension becomes real-world accurate.',
            },
            {
              title: 'Smart dimension lock',
              body: 'Resizing one dimension preserves proportions instead of dumb uniform scaling.',
            },
            {
              title: 'Print-ready validation',
              body: 'Wall thickness, overhangs, and stability checked before you export.',
            },
            {
              title: 'Context-aware AI assistant',
              body: '"Make this bracket fit a 32mm pipe" — and watch the model update.',
            },
          ].map((feature) => (
            <div key={feature.title} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <dt className="text-sm font-medium text-slate-100">{feature.title}</dt>
              <dd className="mt-1 text-xs text-slate-400">{feature.body}</dd>
            </div>
          ))}
        </dl>
      )}

      {phase !== 'done' && (
        <UploadZone
          onFileSelected={handleFileSelected}
          onValidationError={handleValidationError}
          disabled={phase === 'uploading' || phase === 'job'}
        />
      )}

      {phase === 'idle' && <ObjectLibrary session={session} />}

      {phase === 'uploading' && !job && <p className="text-sm text-slate-400">Uploading photo…</p>}
      {phase === 'job' && job && <ProgressStages job={job} />}

      {error && <ErrorCard error={error} onRetry={reset} />}

      {phase === 'done' && job?.model_url && (
        <div className="flex w-full flex-col gap-6">
          <ModelViewer
            ref={modelViewerRef}
            modelUrl={job.model_url}
            gestureRef={gesturesEnabled ? gestureRef : undefined}
          />

          <label className="flex items-center gap-2 self-center text-sm text-slate-400">
            <input
              type="checkbox"
              checked={gesturesEnabled}
              onChange={(event) => setGesturesEnabled(event.target.checked)}
              className="size-4 rounded border-slate-700 bg-slate-800 accent-teal-400"
            />
            Use hand gestures (experimental) — palm to orbit, pinch to zoom, two hands to resize
          </label>
          {gesturesEnabled && gestureError && (
            <p className="self-center text-xs text-amber-300">
              Couldn't start hand tracking: {gestureError}. Mouse controls still work.
            </p>
          )}

          {measurement && <DimensionPanel measurement={measurement} />}
          {jobId && (
            <SaveScanButton session={session} jobId={jobId} modelUrl={job.model_url} measurement={measurement} />
          )}
          {jobId && <AssistantChat jobId={jobId} onActions={handleAssistantActions} />}
          <div className="flex justify-center">
            <Button variant="ghost" onClick={reset}>
              Scan another object
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
