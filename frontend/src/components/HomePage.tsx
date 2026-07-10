import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Sidebar, { type DashboardView } from './Sidebar'
import { supabase } from '../lib/supabase'
import type { Scan } from '../lib/types'

function DashboardHome({ session, scanCount }: { session: Session; scanCount: number | null }) {
  const name = session.user.user_metadata?.name ?? session.user.email
  return (
    <>
      <p className="eyebrow">Dashboard</p>
      <h1 className="page-title">Welcome back, {name}.</h1>
      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-value">{scanCount ?? '—'}</span>
          <span className="stat-label">Objects scanned</span>
        </div>
      </div>
      <div className="empty-card">
        <p className="empty-title">Ready to measure something?</p>
        <p className="empty-body">
          Photograph an object next to a coin or card and Tulasi calibrates it to real-world millimeters.
        </p>
        <button className="btn btn-primary" type="button">
          Scan your first object
        </button>
      </div>
    </>
  )
}

function LibraryView({ scans, loading }: { scans: Scan[]; loading: boolean }) {
  return (
    <>
      <p className="eyebrow">Library</p>
      <h1 className="page-title">Your scanned objects</h1>
      {loading && <p className="empty-body">Loading…</p>}
      {!loading && scans.length === 0 && (
        <div className="empty-card">
          <p className="empty-title">Nothing saved yet</p>
          <p className="empty-body">Objects you scan and save will show up here with their real dimensions.</p>
        </div>
      )}
      {scans.length > 0 && (
        <div className="scan-list">
          {scans.map((scan) => (
            <div key={scan.id} className="scan-row">
              <span>{scan.object_name ?? scan.job_id}</span>
              <span className="scan-dims">
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
      <p className="eyebrow">New scan</p>
      <h1 className="page-title">Upload a photo</h1>
      <div className="empty-card">
        <p className="empty-title">Scan pipeline coming next</p>
        <p className="empty-body">
          The upload → calibrate → 3D model flow is being rebuilt in this fresh version — not wired up
          yet.
        </p>
      </div>
    </>
  )
}

function SettingsView({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  return (
    <>
      <p className="eyebrow">Settings</p>
      <h1 className="page-title">Account</h1>
      <div className="empty-card">
        <p className="empty-title">{session.user.email}</p>
        <p className="empty-body">Signed in via {session.user.app_metadata?.provider ?? 'email'}.</p>
        <button className="btn btn-ghost" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </>
  )
}

export default function HomePage({ session }: { session: Session }) {
  const [view, setView] = useState<DashboardView>('dashboard')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [scans, setScans] = useState<Scan[]>([])
  const [scansLoading, setScansLoading] = useState(true)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
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
    <div className="app-shell">
      <Sidebar
        activeView={view}
        onSelectView={setView}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />
      <main className="main-content">
        {view === 'dashboard' && <DashboardHome session={session} scanCount={scansLoading ? null : scans.length} />}
        {view === 'library' && <LibraryView scans={scans} loading={scansLoading} />}
        {view === 'scan' && <ScanView />}
        {view === 'settings' && <SettingsView session={session} onSignOut={() => supabase?.auth.signOut()} />}
      </main>
    </div>
  )
}
