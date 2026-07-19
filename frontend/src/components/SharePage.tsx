import { useEffect, useState } from 'react'
import ModelViewer from './scan/ModelViewer'
import { ApiError, getSharedScan } from '@/lib/api'
import { formatDimensions, useUnit } from '@/lib/units'
import type { SharedScan } from '@/lib/types'

// Public, unauthenticated read-only view of a shared model. No nav, no chat,
// no edit controls, no library — just the model and its dimensions.
export default function SharePage({ slug }: { slug: string }) {
  const [scan, setScan] = useState<SharedScan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unit] = useUnit()

  useEffect(() => {
    let cancelled = false
    getSharedScan(slug)
      .then((data) => {
        if (!cancelled) setScan(data)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.detail.human_message : 'This shared model is unavailable.')
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="flex items-center gap-2 font-mono text-xs tracking-[0.3em] uppercase">
        <span className="inline-block h-2 w-2 bg-teal" />
        <span className="text-foreground">tulasi</span>
        <span className="text-muted-foreground">.ai</span>
      </div>

      {error && (
        <div className="max-w-md text-center">
          <p className="font-semibold text-brand-coral">Not available</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {!error && !scan && <p className="text-sm text-muted-foreground">Loading shared model…</p>}

      {scan && (
        <div className="flex w-full max-w-xl flex-col gap-4">
          <h1 className="text-center font-display text-2xl">{scan.object_name ?? 'Shared model'}</h1>
          {scan.model_url ? (
            <ModelViewer modelUrl={scan.model_url} />
          ) : (
            <p className="text-center text-sm text-muted-foreground">This scan has no model file.</p>
          )}
          <p className="text-center font-display text-sm text-muted-foreground">
            {scan.width_mm && scan.height_mm
              ? formatDimensions(scan.width_mm, scan.height_mm, scan.depth_mm ?? 0, unit)
              : 'No measured dimensions'}
          </p>
          <a
            href="/"
            className="mx-auto font-mono text-[10px] tracking-[0.25em] uppercase text-muted-foreground hover:text-foreground"
          >
            Measured with Tulasi →
          </a>
        </div>
      )}
    </div>
  )
}
