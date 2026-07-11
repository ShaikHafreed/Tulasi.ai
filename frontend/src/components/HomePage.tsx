import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Sidebar, { type DashboardView } from './Sidebar'
import UploadZone from './scan/UploadZone'
import ProgressStages from './scan/ProgressStages'
import ModelViewer, { type RotationTrigger } from './scan/ModelViewer'
import DimensionPanel, { type Dimensions, type ExternalUpdate } from './scan/DimensionPanel'
import ChatPanel from './assistant/ChatPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ApiError, getJobStatus, uploadImage } from '@/lib/api'
import { supabase } from '../lib/supabase'
import { pushEvent } from '../lib/tulasiEvents'
import { clearCommandHandlers, registerCommandHandlers } from '../lib/tulasiCommands'
import type { PrintCheckResult } from '../lib/tulasiCommands'
import { getVoiceEnabled, setVoiceEnabled } from '../lib/voicePreference'
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

function LibraryView({ scans, loading }: { scans: Scan[]; loading: boolean }) {
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
              <div className="aspect-square overflow-hidden rounded-2xl bg-secondary">
                {scan.image_url ? (
                  <img
                    src={scan.image_url}
                    alt={scan.object_name ?? 'Scanned object'}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                    No photo
                  </div>
                )}
              </div>
              <div className="px-1">
                <p className="truncate text-sm font-medium">{scan.object_name ?? scan.job_id}</p>
                <p className="font-display text-[0.78rem] text-muted-foreground">
                  {scan.width_mm && scan.height_mm
                    ? `${scan.width_mm.toFixed(1)} × ${scan.height_mm.toFixed(1)} mm`
                    : '—'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function ScanView({ onScanSaved }: { onScanSaved: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'job' | 'done'>('idle')
  const [job, setJob] = useState<JobRecord | null>(null)
  const [error, setError] = useState<ErrorDetail | null>(null)
  const [liveDims, setLiveDims] = useState<Dimensions | null>(null)
  const [assistantOverride, setAssistantOverride] = useState<ExternalUpdate | null>(null)
  const [rotation, setRotation] = useState<RotationTrigger | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [autoPrintResult, setAutoPrintResult] = useState<PrintCheckResult | null>(null)
  const pollHandle = useRef<number | null>(null)
  const baselineMaxMm = useRef<number | null>(null)
  const referenceLogged = useRef(false)
  const autoPrintChecked = useRef(false)
  const nonceCounter = useRef(0)

  useEffect(() => {
    return () => {
      if (pollHandle.current !== null) clearInterval(pollHandle.current)
      clearCommandHandlers()
    }
  }, [])

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
      runPrintCheck: () => {
        const result = printCheck(liveDims)
        pushEvent('print_check_run', { ...result })
        return result
      },
      exportModel: () => {
        pushEvent('export_requested', { model_url: job.model_url })
        const link = document.createElement('a')
        link.href = job.model_url!
        link.download = 'tulasi-model.glb'
        link.click()
      },
      addReferenceHint: (params) => {
        setHint(`Tip: place a ${params.reference_type} flat in frame next to the object, then rescan for accurate millimeters.`)
      },
    })
  }, [liveDims, job?.model_url])

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
    setPhase('idle')
    setJob(null)
    setError(null)
    setLiveDims(null)
    setAssistantOverride(null)
    setRotation(null)
    setHint(null)
    setAutoPrintResult(null)
    baselineMaxMm.current = null
    referenceLogged.current = false
    autoPrintChecked.current = false
  }, [])

  const handleFileSelected = useCallback(
    async (file: File) => {
      setPhase('uploading')
      setError(null)
      setJob(null)
      setLiveDims(null)
      setAssistantOverride(null)
      setRotation(null)
      setHint(null)
      setAutoPrintResult(null)
      baselineMaxMm.current = null
      referenceLogged.current = false
      autoPrintChecked.current = false
      pushEvent('scan_started', { file_name: file.name })

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
              onScanSaved()
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
    },
    [onScanSaved],
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
          />

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

          <Button variant="ghost" className="w-fit" onClick={reset}>
            Scan another object
          </Button>
        </div>
      )}
    </>
  )
}

function SettingsView({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
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
    </>
  )
}

export default function HomePage({ session }: { session: Session }) {
  const [view, setView] = useState<DashboardView>('dashboard')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [scans, setScans] = useState<Scan[]>([])
  const [scansLoading, setScansLoading] = useState(true)

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
          <LibraryView scans={scans} loading={scansLoading} />
        </div>
        <div className={view === 'scan' ? '' : 'hidden'}>
          <ScanView onScanSaved={refreshScans} />
        </div>
        <div className={view === 'settings' ? '' : 'hidden'}>
          <SettingsView session={session} onSignOut={() => supabase?.auth.signOut()} />
        </div>
      </main>
      <ChatPanel />
    </div>
  )
}
