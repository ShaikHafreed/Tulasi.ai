import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Sidebar, { type DashboardView } from './Sidebar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { supabase } from '../lib/supabase'
import type { Scan } from '../lib/types'

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

function DashboardHome({ session, scanCount }: { session: Session; scanCount: number | null }) {
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
        <Button variant="warm" className="mt-1 w-fit">
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

function ScanView() {
  return (
    <>
      <Eyebrow>New scan</Eyebrow>
      <PageTitle>Upload a photo</PageTitle>
      <EmptyCard
        title="Scan pipeline coming next"
        body="The upload → calibrate → 3D model flow is being rebuilt in this fresh version — not wired up yet."
      />
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

  useEffect(() => {
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

  return (
    <div className="min-h-screen">
      <Sidebar
        activeView={view}
        onSelectView={setView}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />
      <main className="mx-auto max-w-[900px] px-10 pt-27 pb-12">
        {view === 'dashboard' && <DashboardHome session={session} scanCount={scansLoading ? null : scans.length} />}
        {view === 'library' && <LibraryView scans={scans} loading={scansLoading} />}
        {view === 'scan' && <ScanView />}
        {view === 'settings' && <SettingsView session={session} onSignOut={() => supabase?.auth.signOut()} />}
      </main>
    </div>
  )
}
