import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Download, Trash2 } from 'lucide-react'
import Sidebar, { type DashboardView } from './Sidebar'
import UploadZone from './scan/UploadZone'
import ProgressStages from './scan/ProgressStages'
import ModelViewer, { type PanTrigger, type RotationTrigger } from './scan/ModelViewer'
import DimensionPanel, { type Dimensions, type ExternalUpdate } from './scan/DimensionPanel'
import CharacterRig from './scan/CharacterRig'
import WebcamGesturePanel from './scan/WebcamGesturePanel'
import GloveGesturePanel from './scan/GloveGesturePanel'
import ChatPanel from './assistant/ChatPanel'
import CommandPalette from './CommandPalette'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { ApiError, deleteScan, exportScan, getJobStatus, uploadImage, uploadThumbnail } from '@/lib/api'
import { supabase } from '../lib/supabase'
import { pushEvent } from '../lib/tulasiEvents'
import { clearCommandHandlers, registerCommandHandlers } from '../lib/tulasiCommands'
import type { PrintCheckResult } from '../lib/tulasiCommands'
import { getVoiceEnabled, setVoiceEnabled } from '../lib/voicePreference'
import {
  getGloveGestureEnabled,
  getWebcamGestureEnabled,
  setGloveGestureEnabled,
  setWebcamGestureEnabled,
} from '../lib/gesturePreference'
import type { ErrorDetail, JobRecord, Scan } from '../lib/types'

const MIN_PRINTABLE_MM = 2
const MAX_ASPECT_FOR_STABILITY = 4

function printCheck(dims: Dimensions): PrintCheckResult {
  const warnings: string[] = []
  const values = [dims.width_mm, dims.height_mm, dims.depth_mm]
  const smallest = Math.min(...values)
  const largest = Math.max(...values)

  if (smallest < MIN_PRINTABLE_MM) {
    warnings.push(`Thinnest dimension is ${smallest.toFixed(1)}mm — features under ${MIN_PRINTABLE_MM}mm often fail on FDM printers.`)
  }
  if (largest / Math.max(smallest, 0.1) > MAX_ASPECT_FOR_STABILITY) {
    warnings.push('Tall and narrow relative to its base — may need a brim or raft for bed stability.')
  }

  return { passed: warnings.length === 0, warnings }
}

const POLL_INTERVAL_MS = 1500

// The in-progress/finished scan lives only in this component's React state,
// so a hard refresh used to wipe it even though the backend job (and the
// finished model) were still alive — sessionStorage lets ScanView rehydrate
// from GET /api/jobs/{id} on mount instead of resetting to the upload
// prompt. Session-scoped (not localStorage) since it's just "resume what
// this tab was doing," not something that should follow the user forever.
const ACTIVE_JOB_STORAGE_KEY = 'tulasi_active_scan_job_id'

const UNKNOWN_ERROR: ErrorDetail = {
  error_code: 'unknown_error',
  human_message: 'Lost connection to the server.',
  suggested_action: 'Check the backend is running and try again.',
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-display text-[11px] tracking-[0.16em] text-primary uppercase">{children}</p>
}

function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mt-3.5 mb-8 text-balance font-display text-3xl tracking-tight uppercase">{children}</h1>
  )
}

function EmptyCard({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <Card className="max-w-[480px] gap-3 p-8">
      <p className="font-semibold">{title}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      {children}
    </Card>
  )
}

function DashboardHome({
  session,
  scanCount,
  onGoToScan,
}: {
  session: Session
  scanCount: number | null
  onGoToScan: () => void
}) {
  const name = session.user.user_metadata?.name ?? session.user.email
  return (
    <>
      <Eyebrow>Dashboard</Eyebrow>
      <PageTitle>Welcome back, {name}.</PageTitle>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.3fr_1fr] sm:grid-rows-[auto_auto]">
        <div className="clay clay-coral row-span-2 flex flex-col justify-between gap-6 p-8">
          <div>
            <p className="font-display text-[11px] tracking-[0.16em] text-brand-coral uppercase">
              Ready to measure something?
            </p>
            <p className="mt-3 max-w-[36ch] text-sm leading-relaxed text-muted-foreground">
              Photograph an object next to a coin or card and Tulasi calibrates it to real-world
              millimeters — no guessing, no eyeballing.
            </p>
          </div>
          <button type="button" className="nova-btn w-fit" onClick={onGoToScan}>
            <span className="nova-stars" aria-hidden="true" />
            <span className="nova-glow" aria-hidden="true" />
            <span className="nova-label">Scan your first object</span>
          </button>
        </div>

        <div className="clay flex flex-col gap-1.5 p-6">
          <span className="font-display text-4xl tabular-nums text-primary">{scanCount ?? '—'}</span>
          <span className="text-[0.8rem] text-muted-foreground">Objects scanned</span>
        </div>

        <div className="clay flex flex-col gap-1.5 p-6">
          <span className="font-display text-[11px] tracking-[0.1em] text-primary uppercase">Tip</span>
          <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
            A credit card gives the most accurate calibration — flat, standard-sized, easy to spot.
          </p>
        </div>
      </div>
    </>
  )
}

function LibraryView({
  scans,
  loading,
  onScanDeleted,
}: {
  scans: Scan[]
  loading: boolean
  onScanDeleted: () => void
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [viewingScan, setViewingScan] = useState<Scan | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function confirmDelete(scan: Scan) {
    setDeleting(true)
    try {
      await deleteScan(scan.job_id)
      onScanDeleted()
    } catch {
      // Swallow — the row stays visible so the user can retry.
    } finally {
      setDeleting(false)
      setConfirmDeleteId(null)
    }
  }

  return (
    <>
      <Eyebrow>Library</Eyebrow>
      <PageTitle>Your scanned objects</PageTitle>
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && scans.length === 0 && (
        <EmptyCard
          title="Nothing saved yet"
          body="Objects you scan and save will show up here with their real dimensions."
        />
      )}
      {scans.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {scans.map((scan) => (
            <div key={scan.id} className="clay flex flex-col gap-2.5 overflow-hidden p-3">
              <button
                type="button"
                onClick={() => setViewingScan(scan)}
                disabled={!scan.model_url}
                className="aspect-square overflow-hidden rounded-2xl bg-secondary disabled:cursor-default"
              >
                {scan.image_url ? (
                  <img
                    src={scan.image_url}
                    alt={scan.object_name ?? 'Scanned object'}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                    No preview
                  </div>
                )}
              </button>
              <div className="flex items-start justify-between gap-2 px-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{scan.object_name ?? scan.job_id}</p>
                  <p className="font-display text-[0.78rem] text-muted-foreground">
                    {scan.width_mm && scan.height_mm
                      ? `${scan.width_mm.toFixed(1)} × ${scan.height_mm.toFixed(1)} mm`
                      : '—'}
                  </p>
                </div>
                {confirmDeleteId === scan.id ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => confirmDelete(scan)}
                      className="text-[11px] font-medium text-brand-coral disabled:opacity-50"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-[11px] text-muted-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(scan.id)}
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-brand-coral"
                    aria-label="Remove scan"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!viewingScan} onOpenChange={(open) => !open && setViewingScan(null)}>
        <DialogContent className="max-w-xl p-6">
          <DialogTitle>{viewingScan?.object_name ?? viewingScan?.job_id}</DialogTitle>
          {viewingScan?.model_url && <ModelViewer modelUrl={viewingScan.model_url} />}
          <p className="font-display text-sm text-muted-foreground">
            {viewingScan?.width_mm && viewingScan?.height_mm
              ? `${viewingScan.width_mm.toFixed(1)} × ${viewingScan.height_mm.toFixed(1)} × ${(viewingScan.depth_mm ?? 0).toFixed(1)} mm`
              : 'No measured dimensions'}
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Real-world-scale export. STL is scaled server-side so its bounding box
// equals the measured mm — it opens in a slicer at the true size, which is
// Tulasi's whole "make it FIT right" point. GLB keeps materials for web use.
function ExportCard({ jobId, dims }: { jobId: string; dims: Dimensions | null }) {
  const [busy, setBusy] = useState<'stl' | 'glb' | null>(null)
  const [failed, setFailed] = useState(false)

  async function handleExport(format: 'stl' | 'glb') {
    if (!dims || busy) return
    setBusy(format)
    setFailed(false)
    try {
      await exportScan(jobId, format, dims)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="gap-2 p-4">
      <div className="flex items-center gap-2">
        <Download size={14} className="text-primary" />
        <p className="text-sm font-semibold">Export</p>
        {dims && (
          <span className="font-display text-[11px] text-muted-foreground">
            at {dims.width_mm.toFixed(1)} × {dims.height_mm.toFixed(1)} × {dims.depth_mm.toFixed(1)} mm
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        STL drops into a slicer at real size. GLB keeps colour and materials for web use.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={!dims || busy !== null} onClick={() => handleExport('stl')}>
          {busy === 'stl' ? 'Exporting…' : 'Download STL'}
        </Button>
        <Button variant="ghost" size="sm" disabled={!dims || busy !== null} onClick={() => handleExport('glb')}>
          {busy === 'glb' ? 'Exporting…' : 'Download GLB'}
        </Button>
      </div>
      {failed && <p className="text-xs text-brand-coral">Export failed — check the backend is running and try again.</p>}
    </Card>
  )
}

function ScanView({
  onScanSaved,
  gestureEnabled,
  gloveEnabled,
}: {
  onScanSaved: () => void
  gestureEnabled: boolean
  gloveEnabled: boolean
}) {
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'job' | 'done'>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<JobRecord | null>(null)
  const [error, setError] = useState<ErrorDetail | null>(null)
  const [liveDims, setLiveDims] = useState<Dimensions | null>(null)
  const [assistantOverride, setAssistantOverride] = useState<ExternalUpdate | null>(null)
  const [rotation, setRotation] = useState<RotationTrigger | null>(null)
  const [pan, setPan] = useState<PanTrigger | null>(null)
  const liveDimsRef = useRef<Dimensions | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [autoPrintResult, setAutoPrintResult] = useState<PrintCheckResult | null>(null)
  const pollHandle = useRef<number | null>(null)
  const baselineMaxMm = useRef<number | null>(null)
  const referenceLogged = useRef(false)
  const autoPrintChecked = useRef(false)
  const thumbnailUploaded = useRef(false)
  const nonceCounter = useRef(0)

  const handleSnapshot = useCallback(
    (dataUrl: string) => {
      if (thumbnailUploaded.current || !jobId) return
      thumbnailUploaded.current = true
      uploadThumbnail(jobId, dataUrl).catch(() => {})
    },
    [jobId],
  )

  useEffect(() => {
    return () => {
      if (pollHandle.current !== null) clearInterval(pollHandle.current)
      clearCommandHandlers()
    }
  }, [])

  useEffect(() => {
    liveDimsRef.current = liveDims
  }, [liveDims])

  useEffect(() => {
    if (baselineMaxMm.current === null && job?.dimensions) {
      const { width_mm, height_mm, depth_mm } = job.dimensions
      baselineMaxMm.current = Math.max(width_mm ?? 0, height_mm ?? 0, depth_mm ?? 0) || null
    }
    if (!referenceLogged.current && job?.dimensions) {
      referenceLogged.current = true
      pushEvent('reference_detected', { ...job.dimensions })
    }
  }, [job?.dimensions])

  useEffect(() => {
    if (!liveDims || !job?.model_url) return
    registerCommandHandlers({
      setDimensions: (params) => {
        nonceCounter.current += 1
        setAssistantOverride({ dims: params, nonce: nonceCounter.current })
        setLiveDims(params)
      },
      rotateView: (params) => {
        nonceCounter.current += 1
        setRotation({ ...params, nonce: nonceCounter.current })
      },
      panView: (params) => {
        nonceCounter.current += 1
        setPan({ ...params, nonce: nonceCounter.current })
      },
      runPrintCheck: () => {
        const result = printCheck(liveDims)
        pushEvent('print_check_run', { ...result })
        return result
      },
      exportModel: (params) => {
        const format = params.format ?? 'stl'
        pushEvent('export_requested', { format })
        if (jobId) exportScan(jobId, format, liveDims).catch(() => {})
      },
      addReferenceHint: (params) => {
        setHint(`Tip: place a ${params.reference_type} flat in frame next to the object, then rescan for accurate millimeters.`)
      },
    })
  }, [liveDims, job?.model_url, jobId])

  // Automatically run the print check the moment a scan finishes — it's
  // read-only and reversible, so it fits the "reversible actions auto-run"
  // rule without needing the user to ask the chat assistant first.
  useEffect(() => {
    if (phase !== 'done' || !liveDims || autoPrintChecked.current) return
    autoPrintChecked.current = true
    const result = printCheck(liveDims)
    setAutoPrintResult(result)
    pushEvent('print_check_run', { ...result, automatic: true })
  }, [phase, liveDims])

  const reset = useCallback(() => {
    if (pollHandle.current !== null) clearInterval(pollHandle.current)
    clearCommandHandlers()
    sessionStorage.removeItem(ACTIVE_JOB_STORAGE_KEY)
    setPhase('idle')
    setJobId(null)
    setJob(null)
    setError(null)
    setLiveDims(null)
    setAssistantOverride(null)
    setRotation(null)
    setPan(null)
    setHint(null)
    setAutoPrintResult(null)
    baselineMaxMm.current = null
    referenceLogged.current = false
    autoPrintChecked.current = false
    thumbnailUploaded.current = false
  }, [])

  // Shared by a fresh upload and by resuming a job found in sessionStorage
  // after a page refresh — both watch the same job id to completion. But a
  // fresh upload that dies is a real error worth showing; a *resumed* job
  // that's gone (backend restarted, stale id) is just stale state and must
  // fail silently back to the upload prompt — never nag on page load.
  // `silentOnError` draws that line.
  const startPolling = useCallback(
    (idToPoll: string, silentOnError = false) => {
      if (pollHandle.current !== null) clearInterval(pollHandle.current)
      pollHandle.current = window.setInterval(async () => {
        try {
          const record = await getJobStatus(idToPoll)
          setJob(record)

          if (record.status === 'succeeded') {
            clearInterval(pollHandle.current!)
            setPhase('done')
            onScanSaved()
          } else if (record.status === 'failed') {
            clearInterval(pollHandle.current!)
            sessionStorage.removeItem(ACTIVE_JOB_STORAGE_KEY)
            if (!silentOnError) setError(record.error ?? UNKNOWN_ERROR)
            setPhase('idle')
          }
        } catch (err) {
          clearInterval(pollHandle.current!)
          sessionStorage.removeItem(ACTIVE_JOB_STORAGE_KEY)
          if (!silentOnError) setError(err instanceof ApiError ? err.detail : UNKNOWN_ERROR)
          setPhase('idle')
        }
      }, POLL_INTERVAL_MS)
    },
    [onScanSaved],
  )

  // Resume whatever this tab was doing before a refresh — the backend job
  // (in-memory but the process itself doesn't restart on a frontend
  // reload) and the finished scan are both still there; only this
  // component's React state was lost.
  useEffect(() => {
    const savedJobId = sessionStorage.getItem(ACTIVE_JOB_STORAGE_KEY)
    if (!savedJobId) return

    // Stay in 'idle' until we've confirmed the saved job actually exists —
    // don't optimistically flip to the progress view, or a stale id flashes
    // fake progress before falling back. Everything here is best-effort and
    // silent: a missing/stale job just leaves the clean upload prompt.
    getJobStatus(savedJobId)
      .then((record) => {
        if (record.status === 'succeeded') {
          setJobId(savedJobId)
          setJob(record)
          setPhase('done')
        } else if (record.status === 'failed') {
          sessionStorage.removeItem(ACTIVE_JOB_STORAGE_KEY)
        } else {
          setJobId(savedJobId)
          setJob(record)
          setPhase('job')
          startPolling(savedJobId, true)
        }
      })
      .catch(() => {
        sessionStorage.removeItem(ACTIVE_JOB_STORAGE_KEY)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFileSelected = useCallback(
    async (file: File) => {
      setPhase('uploading')
      setError(null)
      setJobId(null)
      setJob(null)
      setLiveDims(null)
      setAssistantOverride(null)
      setRotation(null)
      setPan(null)
      setHint(null)
      setAutoPrintResult(null)
      baselineMaxMm.current = null
      referenceLogged.current = false
      autoPrintChecked.current = false
      thumbnailUploaded.current = false
      sessionStorage.removeItem(ACTIVE_JOB_STORAGE_KEY)
      pushEvent('scan_started', { file_name: file.name })

      try {
        const { job_id: newJobId } = await uploadImage(file)
        sessionStorage.setItem(ACTIVE_JOB_STORAGE_KEY, newJobId)
        setJobId(newJobId)
        setPhase('job')
        startPolling(newJobId)
      } catch (err) {
        setError(err instanceof ApiError ? err.detail : UNKNOWN_ERROR)
        setPhase('idle')
      }
    },
    [startPolling],
  )

  return (
    <>
      <Eyebrow>New scan</Eyebrow>
      <PageTitle>Upload a photo</PageTitle>

      {phase !== 'done' && (
        <UploadZone
          onFileSelected={handleFileSelected}
          onValidationError={(message) =>
            setError({ error_code: 'client_validation', human_message: message, suggested_action: 'Choose a different photo.' })
          }
          disabled={phase === 'uploading' || phase === 'job'}
        />
      )}

      {phase === 'job' && job && <div className="mt-6"><ProgressStages job={job} /></div>}

      {(phase === 'job' || phase === 'done') && job?.dimensions && (
        <div className="mt-6">
          <DimensionPanel
            measurement={job.dimensions}
            externalUpdate={assistantOverride}
            onChange={(dims) => {
              setLiveDims(dims)
              pushEvent('dimensions_changed', { ...dims })
            }}
          />
        </div>
      )}

      {hint && <p className="mt-3 max-w-md text-xs text-primary">{hint}</p>}

      {error && (
        <Card className="mt-6 max-w-md gap-2 border-brand-coral/40 bg-brand-coral/5 p-6">
          <p className="font-semibold text-brand-coral">Something went wrong</p>
          <p className="text-sm text-muted-foreground">{error.human_message}</p>
          <p className="text-xs text-muted-foreground">{error.suggested_action}</p>
        </Card>
      )}

      {phase === 'done' && job?.model_url && (
        <div className="mt-6 flex max-w-xl flex-col gap-4">
          <ModelViewer
            modelUrl={job.model_url}
            scale={
              liveDims && baselineMaxMm.current
                ? Math.max(liveDims.width_mm, liveDims.height_mm, liveDims.depth_mm) / baselineMaxMm.current
                : 1
            }
            rotationTrigger={rotation}
            panTrigger={pan}
            onSnapshot={handleSnapshot}
          />

          {gestureEnabled && (
            <WebcamGesturePanel enabled={gestureEnabled} getDimensions={() => liveDimsRef.current} />
          )}
          {gloveEnabled && (
            <GloveGesturePanel
              enabled={gloveEnabled}
              getDimensions={() => liveDimsRef.current}
              raised={gestureEnabled}
            />
          )}

          {autoPrintResult && (
            <Card className="gap-1.5 p-4">
              <div className="flex items-center gap-2">
                <Badge variant={autoPrintResult.passed ? 'default' : 'amber'}>
                  {autoPrintResult.passed ? 'Print check passed' : 'Print check flagged'}
                </Badge>
                <span className="text-xs text-muted-foreground">Ran automatically — read-only.</span>
              </div>
              {!autoPrintResult.passed && (
                <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                  {autoPrintResult.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {jobId && <ExportCard jobId={jobId} dims={liveDims} />}

          {job.meshy_task_id && jobId && <CharacterRig jobId={jobId} />}

          <Button variant="ghost" className="w-fit" onClick={reset}>
            Scan another object
          </Button>
        </div>
      )}
    </>
  )
}

function SettingsView({
  session,
  onSignOut,
  gestureEnabled,
  onToggleGesture,
  gloveEnabled,
  onToggleGlove,
}: {
  session: Session
  onSignOut: () => void
  gestureEnabled: boolean
  onToggleGesture: (next: boolean) => void
  gloveEnabled: boolean
  onToggleGlove: (next: boolean) => void
}) {
  const [voiceEnabled, setVoiceEnabledState] = useState(getVoiceEnabled())

  return (
    <>
      <Eyebrow>Settings</Eyebrow>
      <PageTitle>Account</PageTitle>
      <EmptyCard title={session.user.email ?? ''} body={`Signed in via ${session.user.app_metadata?.provider ?? 'email'}.`}>
        <Button variant="outline" className="mt-1 w-fit" onClick={onSignOut}>
          Sign out
        </Button>
      </EmptyCard>

      <Card className="mt-4 max-w-[480px] gap-3 p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Assistant voice replies</p>
            <p className="text-sm text-muted-foreground">
              Spoken in Hafreed's own cloned voice. Off by default — captions are always shown either way.
            </p>
          </div>
          <Switch
            checked={voiceEnabled}
            onCheckedChange={(next) => {
              setVoiceEnabledState(next)
              setVoiceEnabled(next)
            }}
          />
        </div>
      </Card>

      <Card className="mt-4 max-w-[480px] gap-3 p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="flex items-center gap-2 font-semibold">
              Gesture control (webcam) <Badge variant="amber">Experimental</Badge>
            </p>
            <p className="text-sm text-muted-foreground">
              Rotate, pan, and resize the model by moving your hand in front of the webcam. Off by default —
              shows a live camera preview with tracked hand points whenever it's on.
            </p>
          </div>
          <Switch
            checked={gestureEnabled}
            onCheckedChange={(next) => {
              onToggleGesture(next)
              setWebcamGestureEnabled(next)
            }}
          />
        </div>
      </Card>

      <Card className="mt-4 max-w-[480px] gap-3 p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="flex items-center gap-2 font-semibold">
              Gesture control (glove) <Badge variant="amber">Experimental</Badge>
            </p>
            <p className="text-sm text-muted-foreground">
              The physical ESP32 glove (Track 2). Same rotate/pan/resize gestures over Bluetooth. Off by default —
              needs Chrome or Edge, and a "Connect glove" step to pair.
            </p>
          </div>
          <Switch
            checked={gloveEnabled}
            onCheckedChange={(next) => {
              onToggleGlove(next)
              setGloveGestureEnabled(next)
            }}
          />
        </div>
      </Card>
    </>
  )
}

export default function HomePage({ session }: { session: Session }) {
  const [view, setView] = useState<DashboardView>('dashboard')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [scans, setScans] = useState<Scan[]>([])
  const [scansLoading, setScansLoading] = useState(true)
  // Lifted here (not read fresh from localStorage inside each view) because
  // every dashboard view stays mounted once visited — a view read once on
  // mount would miss a toggle flipped from Settings without a remount.
  const [gestureEnabled, setGestureEnabled] = useState(getWebcamGestureEnabled())
  const [gloveEnabled, setGloveEnabled] = useState(getGloveGestureEnabled())

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [theme])

  const refreshScans = useCallback(() => {
    if (!supabase) return
    setScansLoading(true)
    supabase
      .from('scans')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setScans((data as Scan[]) ?? [])
        setScansLoading(false)
      })
  }, [])

  useEffect(() => {
    refreshScans()
  }, [refreshScans])

  // Flip + persist together, the same pair Settings does, so the palette and
  // Settings toggle stay in sync.
  const toggleGesture = useCallback(() => {
    setGestureEnabled((prev) => {
      const next = !prev
      setWebcamGestureEnabled(next)
      return next
    })
  }, [])

  return (
    <div className="min-h-screen">
      <Sidebar
        activeView={view}
        onSelectView={setView}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />
      <main className="mx-auto max-w-[900px] px-10 pt-27 pb-12">
        {/* Every view stays mounted once visited — only hidden via CSS, never
            unmounted — so switching tabs (e.g. to Settings) doesn't kill
            ScanView's in-flight upload polling. That used to be a real bug:
            conditional rendering tore down the interval on navigation and
            looked like "generation stopped" even though the backend job was
            still running fine. */}
        <div className={view === 'dashboard' ? '' : 'hidden'}>
          <DashboardHome
            session={session}
            scanCount={scansLoading ? null : scans.length}
            onGoToScan={() => setView('scan')}
          />
        </div>
        <div className={view === 'library' ? '' : 'hidden'}>
          <LibraryView scans={scans} loading={scansLoading} onScanDeleted={refreshScans} />
        </div>
        <div className={view === 'scan' ? '' : 'hidden'}>
          <ScanView onScanSaved={refreshScans} gestureEnabled={gestureEnabled} gloveEnabled={gloveEnabled} />
        </div>
        <div className={view === 'settings' ? '' : 'hidden'}>
          <SettingsView
            session={session}
            onSignOut={() => supabase?.auth.signOut()}
            gestureEnabled={gestureEnabled}
            onToggleGesture={setGestureEnabled}
            gloveEnabled={gloveEnabled}
            onToggleGlove={setGloveEnabled}
          />
        </div>
      </main>
      <ChatPanel />
      <CommandPalette onNavigate={setView} onToggleGesture={toggleGesture} gestureEnabled={gestureEnabled} />
    </div>
  )
}
