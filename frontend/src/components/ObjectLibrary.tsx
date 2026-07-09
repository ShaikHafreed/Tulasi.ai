import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import type { MeasurementResult, Scan } from '@/lib/types'

export function SaveScanButton({
  session,
  jobId,
  modelUrl,
  measurement,
  onSaved,
}: {
  session: Session | null
  jobId: string
  modelUrl: string
  measurement: MeasurementResult | null
  onSaved?: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!session || !supabase) return null

  async function save() {
    setSaving(true)
    setError(null)
    const { error: insertError } = await supabase!.from('scans').insert({
      user_id: session!.user.id,
      job_id: jobId,
      model_url: modelUrl,
      width_mm: measurement?.width_mm ?? null,
      height_mm: measurement?.height_mm ?? null,
      depth_mm: measurement?.depth_mm ?? null,
      depth_estimated: measurement?.depth_estimated ?? false,
    })
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setSaved(true)
    onSaved?.()
  }

  if (saved) {
    return <p className="text-sm text-teal-300">Saved to your library.</p>
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Button variant="outline" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save to library'}
      </Button>
      {error && <p className="text-xs text-coral">{error}</p>}
    </div>
  )
}

export default function ObjectLibrary({ session }: { session: Session | null }) {
  const [scans, setScans] = useState<Scan[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!session || !supabase) return
    setLoading(true)
    const { data } = await supabase
      .from('scans')
      .select('*')
      .order('created_at', { ascending: false })
    setScans((data as Scan[]) ?? [])
    setLoading(false)
  }, [session])

  useEffect(() => {
    load()
  }, [load])

  if (!session) return null

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Your object library</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {!loading && scans.length === 0 && (
          <p className="text-sm text-slate-400">No saved scans yet — scan something and save it.</p>
        )}
        {scans.map((scan) => (
          <div
            key={scan.id}
            className="flex items-center justify-between rounded-md border border-slate-800 px-3 py-2 text-sm"
          >
            <span className="text-slate-300">
              {scan.width_mm && scan.height_mm
                ? `${scan.width_mm.toFixed(1)} × ${scan.height_mm.toFixed(1)}${
                    scan.depth_mm ? ` × ${scan.depth_mm.toFixed(1)}` : ''
                  } mm`
                : scan.job_id}
            </span>
            <span className="text-xs text-slate-500">{new Date(scan.created_at).toLocaleDateString()}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
