import { useEffect, useRef, useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import UnitToggle from '@/components/UnitToggle'
import { toDisplayValue, unitLabel, unitToMm, useUnit } from '@/lib/units'
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

export interface ExternalUpdate {
  dims: Dimensions
  nonce: number
}

export default function DimensionPanel({
  measurement,
  onChange,
  externalUpdate,
}: {
  measurement: MeasurementResult | null
  onChange?: (dimensions: Dimensions) => void
  externalUpdate?: ExternalUpdate | null
}) {
  const [dims, setDims] = useState<Dimensions>({
    width_mm: measurement?.width_mm ?? FALLBACK_MM.width,
    height_mm: measurement?.height_mm ?? FALLBACK_MM.height,
    depth_mm: measurement?.depth_mm ?? FALLBACK_MM.depth,
  })
  const [aspectLocked, setAspectLocked] = useState(true)
  const [ratio, setRatio] = useState(1)
  const appliedNonce = useRef<number | null>(null)
  const [unit, setUnit] = useUnit()

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
    if (!externalUpdate || externalUpdate.nonce === appliedNonce.current) return
    appliedNonce.current = externalUpdate.nonce
    setDims(externalUpdate.dims)
    setRatio(externalUpdate.dims.height_mm > 0 ? externalUpdate.dims.width_mm / externalUpdate.dims.height_mm : 1)
  }, [externalUpdate])

  useEffect(() => {
    onChange?.(dims)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims])

  const isEstimated = !measurement || measurement.reference_type === 'none'

  // Inputs display in the active unit; storage stays in mm. Convert the typed
  // display value straight back to mm — the primary axis is exact (no
  // rounding), so inch editing introduces no drift.
  const step = unit === 'inch' ? 0.001 : 0.1

  function setWidth(displayValue: number) {
    if (Number.isNaN(displayValue) || displayValue <= 0) return
    const width_mm = unitToMm(displayValue, unit)
    setDims((prev) => ({
      ...prev,
      width_mm,
      height_mm: aspectLocked ? Number((width_mm / ratio).toFixed(2)) : prev.height_mm,
    }))
  }

  function setHeight(displayValue: number) {
    if (Number.isNaN(displayValue) || displayValue <= 0) return
    const height_mm = unitToMm(displayValue, unit)
    setDims((prev) => ({
      ...prev,
      height_mm,
      width_mm: aspectLocked ? Number((height_mm * ratio).toFixed(2)) : prev.width_mm,
    }))
  }

  function setDepth(displayValue: number) {
    if (Number.isNaN(displayValue) || displayValue <= 0) return
    setDims((prev) => ({ ...prev, depth_mm: unitToMm(displayValue, unit) }))
  }

  return (
    <Card className="w-full max-w-md gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Dimensions</p>
        <div className="flex items-center gap-2">
          {isEstimated && <Badge variant="amber">Estimated</Badge>}
          <UnitToggle unit={unit} onChange={setUnit} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {measurement ? referenceLabel(measurement) : 'Measuring…'}
      </p>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="dim-width">Width ({unitLabel(unit)})</Label>
          <Input
            id="dim-width"
            type="number"
            min={0}
            step={step}
            value={toDisplayValue(dims.width_mm, unit)}
            onChange={(event) => setWidth(event.target.valueAsNumber)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dim-height">Height ({unitLabel(unit)})</Label>
          <Input
            id="dim-height"
            type="number"
            min={0}
            step={step}
            value={toDisplayValue(dims.height_mm, unit)}
            onChange={(event) => setHeight(event.target.valueAsNumber)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dim-depth" className="justify-between">
            Depth ({unitLabel(unit)})
            <Badge variant="amber" className="px-1.5 py-0 text-[9px]">
              Est.
            </Badge>
          </Label>
          <Input
            id="dim-depth"
            type="number"
            min={0}
            step={step}
            value={toDisplayValue(dims.depth_mm, unit)}
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
