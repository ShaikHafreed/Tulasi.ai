import { useEffect, useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { MeasurementResult } from '@/lib/types'

const FALLBACK_MM = { width: 50, height: 50, depth: 40 }

export interface Dimensions {
  width_mm: number
  height_mm: number
  depth_mm: number
}

function referenceLabel(measurement: MeasurementResult): string {
  if (measurement.reference_type === 'card') return 'Measured from a credit card'
  if (measurement.reference_type === 'coin') return 'Measured from a coin'
  return 'No reference detected — enter real measurements'
}

export default function DimensionPanel({
  measurement,
  onChange,
}: {
  measurement: MeasurementResult | null
  onChange?: (dimensions: Dimensions) => void
}) {
  const [dims, setDims] = useState<Dimensions>({
    width_mm: measurement?.width_mm ?? FALLBACK_MM.width,
    height_mm: measurement?.height_mm ?? FALLBACK_MM.height,
    depth_mm: measurement?.depth_mm ?? FALLBACK_MM.depth,
  })
  const [aspectLocked, setAspectLocked] = useState(true)
  const [ratio, setRatio] = useState(1)

  useEffect(() => {
    if (!measurement) return
    const next = {
      width_mm: measurement.width_mm ?? FALLBACK_MM.width,
      height_mm: measurement.height_mm ?? FALLBACK_MM.height,
      depth_mm: measurement.depth_mm ?? FALLBACK_MM.depth,
    }
    setDims(next)
    setRatio(next.height_mm > 0 ? next.width_mm / next.height_mm : 1)
  }, [measurement])

  useEffect(() => {
    onChange?.(dims)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims])

  const isEstimated = !measurement || measurement.reference_type === 'none'

  function setWidth(value: number) {
    if (Number.isNaN(value) || value <= 0) return
    setDims((prev) => ({
      ...prev,
      width_mm: value,
      height_mm: aspectLocked ? Number((value / ratio).toFixed(1)) : prev.height_mm,
    }))
  }

  function setHeight(value: number) {
    if (Number.isNaN(value) || value <= 0) return
    setDims((prev) => ({
      ...prev,
      height_mm: value,
      width_mm: aspectLocked ? Number((value * ratio).toFixed(1)) : prev.width_mm,
    }))
  }

  function setDepth(value: number) {
    if (Number.isNaN(value) || value <= 0) return
    setDims((prev) => ({ ...prev, depth_mm: value }))
  }

  return (
    <Card className="w-full max-w-md gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Dimensions</p>
        {isEstimated && <Badge variant="amber">Estimated</Badge>}
      </div>

      <p className="text-xs text-muted-foreground">
        {measurement ? referenceLabel(measurement) : 'Measuring…'}
      </p>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="dim-width">Width (mm)</Label>
          <Input
            id="dim-width"
            type="number"
            min={0}
            value={dims.width_mm}
            onChange={(event) => setWidth(event.target.valueAsNumber)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dim-height">Height (mm)</Label>
          <Input
            id="dim-height"
            type="number"
            min={0}
            value={dims.height_mm}
            onChange={(event) => setHeight(event.target.valueAsNumber)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dim-depth" className="justify-between">
            Depth (mm)
            <Badge variant="amber" className="px-1.5 py-0 text-[9px]">
              Est.
            </Badge>
          </Label>
          <Input
            id="dim-depth"
            type="number"
            min={0}
            value={dims.depth_mm}
            onChange={(event) => setDepth(event.target.valueAsNumber)}
          />
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <Switch id="aspect-lock" checked={aspectLocked} onCheckedChange={setAspectLocked} />
        <Label htmlFor="aspect-lock" className="gap-1.5 text-muted-foreground">
          {aspectLocked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
          Lock aspect ratio
        </Label>
      </div>
    </Card>
  )
}
