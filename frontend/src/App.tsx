import { useCallback, useEffect, useRef, useState } from 'react'
import UploadZone from './components/UploadZone'
import ProgressStages from './components/ProgressStages'
import ModelViewer from './components/ModelViewer'
import ErrorCard from './components/ErrorCard'
import { Button } from './components/ui/button'
import { ApiError, getJobStatus, uploadImage } from './lib/api'
import type { ErrorDetail, JobRecord } from './lib/types'

type Phase = 'idle' | 'uploading' | 'job' | 'done'

const POLL_INTERVAL_MS = 1000

const UNKNOWN_ERROR: ErrorDetail = {
  error_code: 'unknown_error',
  human_message: 'Lost connection to the server.',
  suggested_action: 'Check the backend is running and try again.',
}

function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [job, setJob] = useState<JobRecord | null>(null)
  const [error, setError] = useState<ErrorDetail | null>(null)
  const pollHandle = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pollHandle.current !== null) clearInterval(pollHandle.current)
    }
  }, [])

  const reset = useCallback(() => {
    if (pollHandle.current !== null) clearInterval(pollHandle.current)
    setPhase('idle')
    setJob(null)
    setError(null)
  }, [])

  const handleFileSelected = useCallback(async (file: File) => {
    setPhase('uploading')
    setError(null)
    setJob(null)

    try {
      const { job_id: jobId } = await uploadImage(file)
      setPhase('job')

      pollHandle.current = window.setInterval(async () => {
        try {
          const record = await getJobStatus(jobId)
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

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center gap-8 px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-slate-50">Tulasi.ai — photo to 3D</h1>
        <p className="mt-2 text-sm text-slate-400">Upload a photo of any object and spin it in 3D.</p>
      </div>

      {phase !== 'done' && (
        <UploadZone
          onFileSelected={handleFileSelected}
          onValidationError={handleValidationError}
          disabled={phase === 'uploading' || phase === 'job'}
        />
      )}

      {phase === 'uploading' && !job && <p className="text-sm text-slate-400">Uploading photo…</p>}
      {phase === 'job' && job && <ProgressStages job={job} />}

      {error && <ErrorCard error={error} onRetry={reset} />}

      {phase === 'done' && job?.model_url && (
        <div className="w-full">
          <ModelViewer modelUrl={job.model_url} />
          <div className="mt-4 flex justify-center">
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
