import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { Download, MoreVertical, Pencil, Share2, Trash2 } from 'lucide-react'
import Sidebar, { type DashboardView } from './Sidebar'
import { type GestureMode } from './gesture/GestureStatusIndicator'
import { Readout, SectionHeader } from './tulasi/Readout'
import { ConfirmModal } from './tulasi/ConfirmModal'
import { EmptyState } from './tulasi/EmptyState'
import { SkeletonCard } from './tulasi/Skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import UploadZone from './scan/UploadZone'
import ObjectRecognitionStep from './scan/ObjectRecognitionStep'
import ProgressStages from './scan/ProgressStages'
import ModelViewer, { type PanTrigger, type RotationTrigger } from './scan/ModelViewer'
import DimensionPanel, { type Dimensions, type ExternalUpdate } from './scan/DimensionPanel'
import BeforeAfterSlider from './scan/BeforeAfterSlider'
import OnboardingChecklist from './OnboardingChecklist'
import { markGestureTried } from '../lib/onboarding'
import CharacterRig from './scan/CharacterRig'
import WebcamGesturePanel from './scan/WebcamGesturePanel'
import GloveGesturePanel from './scan/GloveGesturePanel'
import ChatPanel from './assistant/ChatPanel'
import CommandPalette from './CommandPalette'
import UnitToggle from './UnitToggle'
import { formatDimensions, toDisplayValue, unitLabel, useUnit } from '../lib/units'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { ApiError, deleteScan, disableShare, enableShare, exportScan, getJobStatus, renameScan, uploadImages, uploadThumbnail } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { supabase } from '../lib/supabase'
import { pushEvent } from '../lib/tulasiEvents'
import { clearCommandHandlers, executeCommand, isCommandAvailable, registerCommandHandlers } from '../lib/tulasiCommands'
import type { PrintCheckResult } from '../lib/tulasiCommands'
import { getVoiceEnabled, setVoiceEnabled } from '../lib/voicePreference'
import {
  getGloveGestureEnabled,
  getWebcamGestureEnabled,
  setGloveGestureEnabled,
  setWebcamGestureEnabled,
} from '../lib/gesturePreference'
import type { ErrorDetail, JobRecord, Scan } from '../lib/types'
import { printCheck } from '../lib/printCheck'

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

function DashboardHome({
  scans,
  loading,
  onGoToScan,
  onGoToLibrary,
}: {
  scans: Scan[]
  loading: boolean
  onGoToScan: () => void
  onGoToLibrary: () => void
}) {
  const [unit] = useUnit()
  const scanCount = loading ? null : scans.length
  const active = scans[0] ?? null
  const recent = scans.slice(0, 5)

  return (
    <>
      <SectionHeader
        code="01 · dashboard"
        title={
          <>
            Precision <span className="italic text-muted-foreground">at a glance.</span>
          </>
        }
        hint="Your most recent model, its measured dimensions, and everything in your library — one calibrated readout."
        right={
          <button
            type="button"
            onClick={onGoToScan}
            className="border border-teal bg-teal px-4 py-2 font-mono text-[10px] tracking-[0.3em] text-navy-deep uppercase hover:brightness-110"
          >
            + new scan
          </button>
        }
      />

      <OnboardingChecklist hasScans={(scanCount ?? 0) > 0} onGoToScan={onGoToScan} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Active (most-recent) model — real data */}
        <div className="clay corner-ticks relative overflow-hidden p-6 lg:col-span-2">
          <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
            <span className="flex items-center gap-2 text-teal">
              <span className="inline-block h-1.5 w-1.5 bg-teal caret-blink" />
              {active ? `latest · ${active.object_name ?? active.job_id}` : 'no active model'}
            </span>
            {active?.depth_estimated ? <span className="text-coral">depth · est.</span> : <span>fit · true</span>}
          </div>

          {active ? (
            <div className="mt-4 grid grid-cols-1 items-center gap-6 md:grid-cols-[1fr_auto]">
              <div className="flex items-center justify-center">
                {active.image_url ? (
                  <img src={active.image_url} alt={active.object_name ?? 'model'} className="h-48 w-48 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-48 w-48 items-center justify-center rounded-xl border border-border text-xs text-muted-foreground">
                    rendering…
                  </div>
                )}
              </div>
              <div className="grid w-full grid-cols-2 gap-3 md:w-72">
                <Readout label="width" value={active.width_mm ? toDisplayValue(active.width_mm, unit) : '—'} unit={unitLabel(unit)} />
                <Readout label="height" value={active.height_mm ? toDisplayValue(active.height_mm, unit) : '—'} unit={unitLabel(unit)} />
                <Readout label="depth" value={active.depth_mm ? toDisplayValue(active.depth_mm, unit) : '—'} unit={unitLabel(unit)} tone={active.depth_estimated ? 'coral' : 'teal'} />
                <Readout label="scanned" value={new Date(active.created_at).toLocaleDateString()} tone="muted" />
              </div>
            </div>
          ) : (
            <p className="mt-6 max-w-[40ch] text-sm text-muted-foreground">
              No models yet. Photograph an object next to a coin or card and Tulasi calibrates it to real-world
              millimeters.
            </p>
          )}
        </div>

        {/* Quick actions — real navigation, real count */}
        <div className="clay p-5">
          <div className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase">at a glance</div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-4xl tabular-nums text-primary">{scanCount ?? '—'}</span>
            <span className="text-[0.8rem] text-muted-foreground">objects scanned</span>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={onGoToScan}
              className="border border-teal/50 px-3 py-2 text-left font-mono text-[10px] tracking-[0.25em] text-teal uppercase hover:bg-teal/10"
            >
              + new scan
            </button>
            <button
              type="button"
              onClick={onGoToLibrary}
              className="border border-border px-3 py-2 text-left font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase hover:text-foreground"
            >
              open library →
            </button>
          </div>
          <p className="mt-4 text-[0.78rem] leading-relaxed text-muted-foreground">
            Tip: a credit card gives the most accurate calibration — flat, standard-sized, easy to spot.
          </p>
        </div>
      </div>

      {/* Recent — real scans */}
      <div className="clay mt-6">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase">recent</div>
          <button type="button" onClick={onGoToLibrary} className="font-mono text-[10px] tracking-[0.3em] text-teal uppercase hover:underline">
            library →
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Nothing scanned yet.</p>
        ) : (
          <ul>
            {recent.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-6 border-b border-border/50 px-5 py-4 transition-colors last:border-0 hover:bg-teal/[0.03]"
              >
                <div>
                  <div className="text-sm">{r.object_name ?? r.job_id}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{r.job_id.slice(0, 8)}.tul</div>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {r.width_mm && r.height_mm ? formatDimensions(r.width_mm, r.height_mm, r.depth_mm ?? 0, unit) : '—'}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function LibraryView({
  scans,
  loading,
  onScanDeleted,
  onGoToScan,
}: {
  scans: Scan[]
  loading: boolean
  onScanDeleted: () => void
  onGoToScan: () => void
}) {
  const [deleteTarget, setDeleteTarget] = useState<Scan | null>(null)
  const [viewingScan, setViewingScan] = useState<Scan | null>(null)
  const [unit] = useUnit()
  const [deleting, setDeleting] = useState(false)
  const [query, setQuery] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)

  const filtered = scans.filter((s) =>
    `${s.object_name ?? ''} ${s.job_id}`.toLowerCase().includes(query.toLowerCase()),
  )

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteScan(deleteTarget.job_id)
      toast.success('Scan deleted')
      onScanDeleted()
      setDeleteTarget(null)
    } catch {
      toast.error("Couldn't delete that scan — try again.")
    } finally {
      setDeleting(false)
    }
  }

  function startRename(scan: Scan) {
    setRenamingId(scan.id)
    setRenameValue(scan.object_name ?? '')
  }

  async function submitRename(scan: Scan) {
    const name = renameValue.trim()
    if (!name || name === scan.object_name) {
      setRenamingId(null)
      return
    }
    setRenaming(true)
    try {
      await renameScan(scan.job_id, name)
      toast.success('Renamed')
      onScanDeleted()
    } catch {
      toast.error("Couldn't rename that scan — try again.")
    } finally {
      setRenaming(false)
      setRenamingId(null)
    }
  }

  return (
    <>
      <SectionHeader
        code="03 · library"
        title={
          <>
            Every object, <span className="italic text-muted-foreground">measured.</span>
          </>
        }
        hint="Search by name or id. Every card carries its own calibrated readout."
        right={
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search · name / id"
              className="h-9 w-56 border border-border bg-transparent px-3 font-mono text-xs placeholder:text-muted-foreground/60 focus:border-teal focus:outline-none"
            />
            <button
              type="button"
              onClick={onGoToScan}
              className="flex h-9 items-center border border-teal bg-teal px-4 font-mono text-[10px] tracking-[0.3em] text-navy-deep uppercase hover:brightness-110"
            >
              + new
            </button>
          </div>
        }
      />

      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!loading && scans.length === 0 && (
        <EmptyState
          eyebrow="no objects yet"
          title={
            <>
              Your library is <span className="italic text-muted-foreground">calibrated and empty.</span>
            </>
          }
          description="Bring in one photo. Tulasi traces, solves, and fits it to a reference — end-to-end."
          action={
            <button
              type="button"
              onClick={onGoToScan}
              className="inline-flex items-center gap-2 border border-teal bg-teal px-4 py-2 font-mono text-[10px] tracking-[0.3em] text-navy-deep uppercase hover:brightness-110"
            >
              + first scan →
            </button>
          }
        />
      )}

      {!loading && scans.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No objects match “{query}”.</p>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((scan) => (
            <article key={scan.id} className="clay group overflow-hidden transition-colors hover:border-teal/40">
              <button
                type="button"
                onClick={() => setViewingScan(scan)}
                disabled={!scan.model_url}
                className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-navy-deep/60 disabled:cursor-default"
              >
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, var(--color-blueprint) 1px, transparent 1px), linear-gradient(to bottom, var(--color-blueprint) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                  }}
                />
                {scan.image_url ? (
                  <img src={scan.image_url} alt={scan.object_name ?? 'model'} className="relative h-full w-full object-cover" />
                ) : (
                  <span className="relative text-xs text-muted-foreground">No preview</span>
                )}
                <span
                  className={`absolute right-3 top-3 border px-2 py-1 font-mono text-[9px] tracking-[0.25em] uppercase ${
                    scan.depth_estimated
                      ? 'border-coral/50 bg-coral/5 text-coral'
                      : 'border-teal/50 bg-teal/5 text-teal'
                  }`}
                >
                  {scan.depth_estimated ? 'depth · est' : 'measured'}
                </span>
              </button>
              <div className="border-t border-border p-4">
                <div className="flex items-baseline justify-between gap-2">
                  {renamingId === scan.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      disabled={renaming}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => submitRename(scan)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename(scan)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      className="w-full border-b border-teal bg-transparent text-sm focus:outline-none"
                    />
                  ) : (
                    <h3 className="truncate text-sm">{scan.object_name ?? scan.job_id}</h3>
                  )}
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {new Date(scan.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-muted-foreground">{scan.job_id.slice(0, 8)}.tul</span>
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                            aria-label="Scan actions"
                          >
                            <MoreVertical size={14} />
                          </button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Actions</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setViewingScan(scan)}>
                        <Share2 size={13} /> Share
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => startRename(scan)}>
                        <Pencil size={13} /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(scan)}>
                        <Trash2 size={13} /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px]">
                  <div>
                    <span className="text-muted-foreground">w</span>{' '}
                    <span className="text-teal">{scan.width_mm ? toDisplayValue(scan.width_mm, unit) : '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">h</span>{' '}
                    <span className="text-teal">{scan.height_mm ? toDisplayValue(scan.height_mm, unit) : '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">d</span>{' '}
                    <span className={scan.depth_estimated ? 'text-coral' : 'text-teal'}>
                      {scan.depth_mm ? toDisplayValue(scan.depth_mm, unit) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={!!viewingScan} onOpenChange={(open) => !open && setViewingScan(null)}>
        <DialogContent className="max-w-xl p-6">
          <DialogTitle>{viewingScan?.object_name ?? viewingScan?.job_id}</DialogTitle>
          {viewingScan?.model_url && <ModelViewer modelUrl={viewingScan.model_url} />}
          {viewingScan?.source_image_url && viewingScan?.image_url && (
            <div className="flex flex-col gap-1.5">
              <p className="font-display text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Photo → model
              </p>
              <BeforeAfterSlider before={viewingScan.source_image_url} after={viewingScan.image_url} />
            </div>
          )}
          <p className="font-display text-sm text-muted-foreground">
            {viewingScan?.width_mm && viewingScan?.height_mm
              ? formatDimensions(viewingScan.width_mm, viewingScan.height_mm, viewingScan.depth_mm ?? 0, unit)
              : 'No measured dimensions'}
          </p>
          {viewingScan && (
            <ShareControl key={viewingScan.id} jobId={viewingScan.job_id} initialSlug={viewingScan.share_slug} />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this scan?"
        description="The model, photos, and measurements are removed for good — this can't be undone."
        detail={deleteTarget && `${deleteTarget.object_name ?? deleteTarget.job_id} · ${deleteTarget.job_id.slice(0, 8)}.tul`}
        confirmLabel="Delete"
        tone="destructive"
        busy={deleting}
        onConfirm={confirmDelete}
      />
    </>
  )
}

// Per-scan read-only sharing. Off by default; enabling mints an unguessable
// public slug, disabling clears it. Keyed by scan id so it reseeds per scan.
function ShareControl({ jobId, initialSlug }: { jobId: string; initialSlug: string | null }) {
  const [slug, setSlug] = useState<string | null>(initialSlug)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const link = slug ? `${window.location.origin}/share/${slug}` : null

  async function enable() {
    setBusy(true)
    try {
      setSlug(await enableShare(jobId))
      toast.success('Sharing turned on')
    } catch {
      toast.error("Couldn't turn on sharing — try again.")
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      await disableShare(jobId)
      setSlug(null)
      toast('Sharing turned off')
    } catch {
      toast.error("Couldn't turn off sharing — try again.")
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard may be blocked — the field is selectable as a fallback.
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Share read-only link</p>
          <p className="text-xs text-muted-foreground">
            Anyone with the link sees the model and dimensions — no editing, no account. Off by default.
          </p>
        </div>
        {slug ? (
          <Button variant="outline" size="sm" onClick={disable} disabled={busy}>
            Disable
          </Button>
        ) : (
          <Button variant="warm" size="sm" onClick={enable} disabled={busy}>
            Get link
          </Button>
        )}
      </div>
      {link && (
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
            className="font-mono text-xs"
          />
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}
    </div>
  )
}

// Real-world-scale export. STL is scaled server-side so its bounding box
// equals the measured mm — it opens in a slicer at the true size, which is
// Tulasi's whole "make it FIT right" point. GLB keeps materials for web use.
function ExportCard({ jobId, dims }: { jobId: string; dims: Dimensions | null }) {
  const [busy, setBusy] = useState<'stl' | 'glb' | null>(null)
  const [failed, setFailed] = useState(false)
  const [unit] = useUnit()

  async function handleExport(format: 'stl' | 'glb') {
    if (!dims || busy) return
    setBusy(format)
    setFailed(false)
    try {
      await exportScan(jobId, format, dims)
      toast.success(`Exported ${format.toUpperCase()}`)
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
            at {formatDimensions(dims.width_mm, dims.height_mm, dims.depth_mm, unit)}
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
  const [phase, setPhase] = useState<'idle' | 'selecting' | 'uploading' | 'job' | 'done'>('idle')
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null)
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
    setPendingFiles(null)
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
            toast.success('Scan saved to your library')
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

  // Picking photos goes to the "confirm your object" step first — nothing is
  // uploaded or generated until the user has framed what they actually want.
  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length === 0) return
    setError(null)
    setPendingFiles(files)
    setPhase('selecting')
  }, [])

  const startGeneration = useCallback(
    async (files: File[]) => {
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
      pushEvent('scan_started', { file_name: files[0].name, photo_count: files.length })

      try {
        const { job_id: newJobId } = await uploadImages(files)
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

      {phase === 'idle' && (
        <UploadZone
          onFilesSelected={handleFilesSelected}
          onValidationError={(message) =>
            setError({ error_code: 'client_validation', human_message: message, suggested_action: 'Choose a different photo.' })
          }
        />
      )}

      {phase === 'selecting' && pendingFiles && (
        <ObjectRecognitionStep
          files={pendingFiles}
          onBack={() => {
            setPendingFiles(null)
            setPhase('idle')
          }}
          onConfirm={(cropped) => startGeneration(cropped)}
        />
      )}

      {phase === 'uploading' && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
          Uploading…
        </div>
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

function SettingsPanel({ code, title, children }: { code: string; title: string; children: React.ReactNode }) {
  return (
    <div className="clay p-6">
      <div className="mb-4 flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
        <span className="text-teal">{code}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  )
}

// Standalone print-readiness report — runs the same real printCheck()
// heuristics the New-scan flow and the assistant's runPrintCheck command
// use, against any of your real measured scans, not a mock/preview number.
function PrintCheckView({
  scans,
  loading,
  onGoToScan,
}: {
  scans: Scan[]
  loading: boolean
  onGoToScan: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [unit] = useUnit()

  const measured = scans.filter((s) => s.width_mm && s.height_mm && s.depth_mm)
  const selected = measured.find((s) => s.id === selectedId) ?? measured[0] ?? null
  const result =
    selected && selected.width_mm && selected.height_mm && selected.depth_mm
      ? printCheck({ width_mm: selected.width_mm, height_mm: selected.height_mm, depth_mm: selected.depth_mm })
      : null

  return (
    <>
      <SectionHeader
        code="05 · print check"
        title={
          <>
            Will it <span className="italic text-muted-foreground">actually print?</span>
          </>
        }
        hint="Checks your scan's measured W/H/D against two FDM printability rules (minimum feature thickness, base-to-height stability) — a dimension check, not a full mesh analysis of walls or overhangs."
      />

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && measured.length === 0 && (
        <EmptyState
          eyebrow="nothing measured yet"
          title={
            <>
              Scan something <span className="italic text-muted-foreground">to check it.</span>
            </>
          }
          description="Print check needs real measured dimensions — scan an object with a reference (coin or card) in frame first."
          action={
            <button
              type="button"
              onClick={onGoToScan}
              className="inline-flex items-center gap-2 border border-teal bg-teal px-4 py-2 font-mono text-[10px] tracking-[0.3em] text-navy-deep uppercase hover:brightness-110"
            >
              + new scan →
            </button>
          }
        />
      )}

      {!loading && selected && result && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          <div className="flex flex-col gap-1.5">
            {measured.map((scan) => (
              <button
                key={scan.id}
                type="button"
                onClick={() => setSelectedId(scan.id)}
                className={`border px-3 py-2.5 text-left transition-colors ${
                  scan.id === selected.id ? 'border-teal bg-teal/5' : 'border-border hover:border-teal/40'
                }`}
              >
                <div className="truncate text-sm">{scan.object_name ?? scan.job_id}</div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {formatDimensions(scan.width_mm!, scan.height_mm!, scan.depth_mm!, unit)}
                </div>
              </button>
            ))}
          </div>

          <div className="clay corner-ticks p-6">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${result.passed ? 'bg-teal' : 'bg-coral'}`} />
              <span className={`font-mono text-[11px] tracking-[0.25em] uppercase ${result.passed ? 'text-teal' : 'text-coral'}`}>
                {result.passed ? 'print check passed' : 'print check flagged'}
              </span>
            </div>
            <h3 className="mt-2 font-display text-xl">{selected.object_name ?? selected.job_id}</h3>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <Readout label="w" value={toDisplayValue(selected.width_mm!, unit)} unit={unitLabel(unit)} />
              <Readout label="h" value={toDisplayValue(selected.height_mm!, unit)} unit={unitLabel(unit)} />
              <Readout
                label="d"
                value={toDisplayValue(selected.depth_mm!, unit)}
                unit={unitLabel(unit)}
                tone={selected.depth_estimated ? 'coral' : 'teal'}
              />
            </div>

            {result.warnings.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-2">
                {result.warnings.map((warning) => (
                  <li key={warning} className="border border-coral/30 bg-coral/5 px-3 py-2 text-sm text-foreground">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No issues at these dimensions.</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function SettingsView({
  session,
  onSignOut,
  gestureMode,
  onSelectGestureMode,
}: {
  session: Session
  onSignOut: () => void
  gestureMode: GestureMode
  onSelectGestureMode: (mode: GestureMode) => void
}) {
  const [voiceEnabled, setVoiceEnabledState] = useState(getVoiceEnabled())
  const [unit, setUnit] = useUnit()
  const email = session.user.email ?? ''
  const provider = session.user.app_metadata?.provider ?? 'email'

  const GESTURE_CARDS: { mode: GestureMode; title: string; hint: string; accent: string }[] = [
    { mode: 'off', title: 'No input tracking', hint: 'keyboard + mouse only', accent: 'text-muted-foreground' },
    { mode: 'webcam', title: 'Webcam · monocular', hint: 'no calibration required', accent: 'text-teal' },
    { mode: 'glove', title: 'Glove · 6-dof', hint: 'pair via bluetooth · beta', accent: 'text-coral' },
  ]

  return (
    <>
      <SectionHeader
        code="04 · settings"
        title={
          <>
            Your workbench, <span className="italic text-muted-foreground">calibrated.</span>
          </>
        }
        hint="Every preference is a measurement. Change one and the workspace re-fits."
      />

      <div className="grid grid-cols-1 gap-6">
        <SettingsPanel code="01" title="account">
          <div className="flex items-center gap-6">
            <div className="clay flex h-16 w-16 items-center justify-center font-display text-2xl text-teal">
              {email.slice(0, 1).toUpperCase() || 'T'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{email}</div>
              <div className="mt-1 font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                signed in via {provider}
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="flex h-9 shrink-0 items-center border border-border px-4 font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase hover:border-coral/50 hover:text-coral"
            >
              sign out
            </button>
          </div>
        </SettingsPanel>

        <SettingsPanel code="02" title="input · gesture">
          <p className="mb-4 max-w-md text-xs text-muted-foreground">
            Rotate, pan, and resize your model with your hand. Webcam needs no calibration; the ESP32 glove pairs over
            Bluetooth for six-degree precision. Both need Chrome or Edge.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {GESTURE_CARDS.map((card) => {
              const active = gestureMode === card.mode
              return (
                <button
                  key={card.mode}
                  type="button"
                  onClick={() => onSelectGestureMode(card.mode)}
                  className={`border p-4 text-left transition-colors ${
                    active
                      ? card.mode === 'glove'
                        ? 'border-coral bg-coral/5'
                        : 'border-teal bg-teal/5'
                      : 'border-border hover:border-teal/50'
                  }`}
                >
                  <div className={`font-mono text-[9px] tracking-[0.3em] uppercase ${card.accent}`}>{card.mode}</div>
                  <div className="mt-2 text-sm">{card.title}</div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">{card.hint}</div>
                </button>
              )
            })}
          </div>
        </SettingsPanel>

        <SettingsPanel code="03" title="workspace">
          <div className="flex items-center justify-between border-b border-border/50 pb-4">
            <div className="max-w-md">
              <div className="text-sm">Measurement units</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Display in millimetres or inches — stored internally in mm either way.
              </p>
            </div>
            <UnitToggle unit={unit} onChange={setUnit} />
          </div>
          <div className="flex items-center justify-between pt-4">
            <div className="max-w-md">
              <div className="text-sm">Assistant voice replies</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Spoken in Hafreed's cloned voice. Off by default — captions always show either way.
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
        </SettingsPanel>
      </div>
    </>
  )
}

export default function HomePage({ session }: { session: Session }) {
  const [view, setView] = useState<DashboardView>('dashboard')
  const [scans, setScans] = useState<Scan[]>([])
  const [scansLoading, setScansLoading] = useState(true)
  // Lifted here (not read fresh from localStorage inside each view) because
  // every dashboard view stays mounted once visited — a view read once on
  // mount would miss a toggle flipped from Settings without a remount.
  const [gestureEnabled, setGestureEnabled] = useState(getWebcamGestureEnabled())
  const [gloveEnabled, setGloveEnabled] = useState(getGloveGestureEnabled())
  // Nonce the nav's "assistant" item bumps to open the real floating
  // ChatPanel — see the comment on Sidebar's NAV_ITEMS_AFTER_ASSISTANT.
  const [assistantOpenSignal, setAssistantOpenSignal] = useState(0)

  // Dark-first, matching the ported design — ensure no stale light class.
  useEffect(() => {
    document.documentElement.classList.remove('light')
  }, [])

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
      if (next) markGestureTried()
      return next
    })
  }, [])

  // Nav gesture control: webcam/glove are mutually exclusive here, all wired to
  // the real persisted toggles.
  const gestureMode: GestureMode = gloveEnabled ? 'glove' : gestureEnabled ? 'webcam' : 'off'
  const selectGestureMode = useCallback((mode: GestureMode) => {
    const webcam = mode === 'webcam'
    const glove = mode === 'glove'
    setGestureEnabled(webcam)
    setWebcamGestureEnabled(webcam)
    if (webcam) markGestureTried()
    setGloveEnabled(glove)
    setGloveGestureEnabled(glove)
    if (mode === 'off') toast('Gesture control off')
    else toast.success(mode === 'webcam' ? 'Webcam gestures connected' : 'Glove connected')
  }, [])
  const present = useCallback(() => {
    if (isCommandAvailable('togglePresentation')) executeCommand('togglePresentation', {})
  }, [])

  return (
    <div className="relative min-h-screen">
      {/* Ported AppBackground — warm terracotta/sage ambient wash behind the app. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(1200px 600px at 20% -10%, rgba(201,111,74,0.06), transparent 60%), radial-gradient(900px 500px at 100% 110%, rgba(122,155,142,0.06), transparent 60%)',
        }}
      />
      <Sidebar
        activeView={view}
        onSelectView={setView}
        gestureMode={gestureMode}
        onSelectGestureMode={selectGestureMode}
        onPresent={present}
        onOpenAssistant={() => setAssistantOpenSignal((n) => n + 1)}
      />
      <main className="mx-auto max-w-[1120px] px-8 pt-20 pb-12">
        {/* Every view stays mounted once visited — only hidden via CSS, never
            unmounted — so switching tabs (e.g. to Settings) doesn't kill
            ScanView's in-flight upload polling. That used to be a real bug:
            conditional rendering tore down the interval on navigation and
            looked like "generation stopped" even though the backend job was
            still running fine. */}
        <div className={view === 'dashboard' ? '' : 'hidden'}>
          <DashboardHome
            scans={scans}
            loading={scansLoading}
            onGoToScan={() => setView('scan')}
            onGoToLibrary={() => setView('library')}
          />
        </div>
        <div className={view === 'library' ? '' : 'hidden'}>
          <LibraryView scans={scans} loading={scansLoading} onScanDeleted={refreshScans} onGoToScan={() => setView('scan')} />
        </div>
        <div className={view === 'scan' ? '' : 'hidden'}>
          <ScanView onScanSaved={refreshScans} gestureEnabled={gestureEnabled} gloveEnabled={gloveEnabled} />
        </div>
        <div className={view === 'print' ? '' : 'hidden'}>
          <PrintCheckView scans={scans} loading={scansLoading} onGoToScan={() => setView('scan')} />
        </div>
        <div className={view === 'settings' ? '' : 'hidden'}>
          <SettingsView
            session={session}
            onSignOut={() => supabase?.auth.signOut()}
            gestureMode={gestureMode}
            onSelectGestureMode={selectGestureMode}
          />
        </div>
      </main>
      <ChatPanel openSignal={assistantOpenSignal} />
      <CommandPalette onNavigate={setView} onToggleGesture={toggleGesture} gestureEnabled={gestureEnabled} />
    </div>
  )
}
