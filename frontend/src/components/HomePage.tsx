import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Sidebar, { type DashboardView } from './Sidebar'
import UploadZone from './scan/UploadZone'
import ProgressStages from './scan/ProgressStages'
import ModelViewer from './scan/ModelViewer'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ApiError, getJobStatus, uploadImage } from '@/lib/api'
import { supabase } from '../lib/supabase'
import type { ErrorDetail, JobRecord, Scan } from '../lib/types'

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
      <div className="mb-7 flex gap-4">
        <Card className="gap-1.5 px-5.5 py-4.5">
          <span className="font-display text-3xl tabular-nums text-primary">{scanCount ?? '—'}</span>
          <span className="text-[0.8rem] text-muted-foreground">Objects scanned</span>
        </Card>
      </div>
      <EmptyCard
        title="Ready to measure something?"
        body="Photograph an object next to a coin or card and Tulasi calibrates it to real-world millimeters."
      >
        <Button variant="warm" className="mt-1 w-fit" onClick={onGoToScan}>
          Scan your first object
        </Button>
      </EmptyCard>
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
        <div className="grid max-w-[480px] gap-2">
          {scans.map((scan) => (
            <div
              key={scan.id}
              className="flex justify-between rounded-md border border-border px-4 py-3.5 text-sm"
            >
              <span>{scan.object_name ?? scan.job_id}</span>
              <span className="font-display text-[0.82rem] text-muted-foreground">
                {scan.width_mm && scan.height_mm
                  ? `${scan.width_mm.toFixed(1)} × ${scan.height_mm.toFixed(1)} mm`
                  : '—'}
              </span>
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

  const handleFileSelected = useCallback(
    async (file: File) => {
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

      {error && (
        <Card className="mt-6 max-w-md gap-2 border-brand-coral/40 bg-brand-coral/5 p-6">
          <p className="font-semibold text-brand-coral">Something went wrong</p>
          <p className="text-sm text-muted-foreground">{error.human_message}</p>
          <p className="text-xs text-muted-foreground">{error.suggested_action}</p>
        </Card>
      )}

      {phase === 'done' && job?.model_url && (
        <div className="mt-6 flex max-w-xl flex-col gap-4">
          <ModelViewer modelUrl={job.model_url} />
          <Button variant="ghost" className="w-fit" onClick={reset}>
            Scan another object
          </Button>
        </div>
      )}
    </>
  )
}

function SettingsView({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  return (
    <>
      <Eyebrow>Settings</Eyebrow>
      <PageTitle>Account</PageTitle>
      <EmptyCard title={session.user.email ?? ''} body={`Signed in via ${session.user.app_metadata?.provider ?? 'email'}.`}>
        <Button variant="outline" className="mt-1 w-fit" onClick={onSignOut}>
          Sign out
        </Button>
      </EmptyCard>
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
        {view === 'dashboard' && (
          <DashboardHome
            session={session}
            scanCount={scansLoading ? null : scans.length}
            onGoToScan={() => setView('scan')}
          />
        )}
        {view === 'library' && <LibraryView scans={scans} loading={scansLoading} />}
        {view === 'scan' && <ScanView onScanSaved={refreshScans} />}
        {view === 'settings' && <SettingsView session={session} onSignOut={() => supabase?.auth.signOut()} />}
      </main>
    </div>
  )
}
