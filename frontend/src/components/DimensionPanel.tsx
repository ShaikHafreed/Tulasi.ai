import { useEffect, useState, type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MeasurementResult } from '@/lib/types'

function EstimatedBadge() {
  return (
    <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-300">
      Estimated
    </span>
  )
}

function DimensionField({
  label,
  value,
  onChange,
  badge,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  badge?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-slate-300">
        {label}
        {badge}
      </span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={Math.round(value * 10) / 10}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-24 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-right text-sm text-slate-100"
        />
        <span className="text-xs text-slate-500">mm</span>
      </div>
    </div>
  )
}

export default function DimensionPanel({ measurement }: { measurement: MeasurementResult }) {
  const [width, setWidth] = useState(measurement.width_mm ?? 0)
  const [height, setHeight] = useState(measurement.height_mm ?? 0)
  const [depth, setDepth] = useState(measurement.depth_mm ?? 0)
  const [aspectLocked, setAspectLocked] = useState(true)

  useEffect(() => {
    setWidth(measurement.width_mm ?? 0)
    setHeight(measurement.height_mm ?? 0)
    setDepth(measurement.depth_mm ?? 0)
  }, [measurement])

  if (!measurement.reference_detected) {
    return (
      <Card className="w-full border-amber-400/30 bg-amber-400/5">
        <CardContent className="flex flex-col gap-2 pt-6">
          <p className="text-sm text-amber-200">No reference object detected.</p>
          <p className="text-sm text-slate-400">
            Add a credit card or ₹10 coin next to the object and re-scan for real-world
            measurements.
          </p>
        </CardContent>
      </Card>
    )
  }

  function handleDimensionChange(dimension: 'width' | 'height' | 'depth', value: number) {
    if (value <= 0) return

    if (!aspectLocked) {
      if (dimension === 'width') setWidth(value)
      if (dimension === 'height') setHeight(value)
      if (dimension === 'depth') setDepth(value)
      return
    }

    const current = { width, height, depth }[dimension]
    const scale = current > 0 ? value / current : 1
    setWidth((w) => w * scale)
    setHeight((h) => h * scale)
    setDepth((d) => d * scale)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Dimensions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DimensionField label="Width" value={width} onChange={(v) => handleDimensionChange('width', v)} />
        <DimensionField label="Height" value={height} onChange={(v) => handleDimensionChange('height', v)} />
        <DimensionField
          label="Depth"
          value={depth}
          onChange={(v) => handleDimensionChange('depth', v)}
          badge={measurement.depth_estimated ? <EstimatedBadge /> : undefined}
        />

        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={aspectLocked}
            onChange={(event) => setAspectLocked(event.target.checked)}
            className="size-4 rounded border-slate-700 bg-slate-800 accent-teal-400"
          />
          Lock aspect ratio
        </label>
      </CardContent>
    </Card>
  )
}
