import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Lock, Unlock } from 'lucide-react'
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

  // Arrow-key nudge: ↑/↓ steps by 1 display unit, Shift+↑/↓ by 0.1 — routes
  // through the SAME setWidth/setHeight/setDepth used by typing, so
  // aspect-lock applies identically either way (native number-input arrow
  // stepping bypasses that logic entirely, which is the bug this replaces).
  function nudge(currentDisplayValue: number, event: KeyboardEvent<HTMLInputElement>, apply: (v: number) => void) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const step = event.shiftKey ? 0.1 : 1
    const delta = event.key === 'ArrowUp' ? step : -step
    apply(Number((currentDisplayValue + delta).toFixed(3)))
  }

  return (
    <Card className="w-full max-w-md gap-4 p-6 transition-all duration-300">
      {/* Screen reader live announcements for dimension changes */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Dimensions updated: Width ${toDisplayValue(dims.width_mm, unit)} ${unitLabel(unit)}, Height ${toDisplayValue(dims.height_mm, unit)} ${unitLabel(unit)}, Depth ${toDisplayValue(dims.depth_mm, unit)} ${unitLabel(unit)}`}
      </div>

      <div className="flex items-center justify-between">
        <p className="font-semibold">Dimensions</p>
        <div className="flex items-center gap-2">
          {isEstimated && (
            <span className="rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] text-amber-600">
              Estimated
            </span>
          )}
          <UnitToggle unit={unit} onChange={setUnit} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {measurement ? referenceLabel(measurement) : 'Measuring…'}
      </p>

      {/* Technical bounding-box diagram — decorative, blueprint aesthetic */}
      <svg
        viewBox="0 0 160 100"
        width={160}
        height={100}
        aria-hidden="true"
        className="text-primary/55 mx-auto"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Front face */}
        <rect x="32" y="28" width="72" height="52" stroke="currentColor" strokeWidth="1.2" />
        {/* Top face */}
        <polygon points="32,28 52,10 124,10 104,28" stroke="currentColor" strokeWidth="1.2" />
        {/* Right face */}
        <polygon points="104,28 124,10 124,62 104,80" stroke="currentColor" strokeWidth="1.2" />

        {/* Width arrow + label */}
        <line x1="32" y1="88" x2="104" y2="88" stroke="currentColor" strokeWidth="0.8" />
        <line x1="32" y1="85" x2="32" y2="91" stroke="currentColor" strokeWidth="0.8" />
        <line x1="104" y1="85" x2="104" y2="91" stroke="currentColor" strokeWidth="0.8" />
        <text x="68" y="97" textAnchor="middle" fontSize="8" fill="currentColor" fontFamily="JetBrains Mono,monospace" letterSpacing="0.06em">W</text>

        {/* Height arrow + label */}
        <line x1="22" y1="28" x2="22" y2="80" stroke="currentColor" strokeWidth="0.8" />
        <line x1="19" y1="28" x2="25" y2="28" stroke="currentColor" strokeWidth="0.8" />
        <line x1="19" y1="80" x2="25" y2="80" stroke="currentColor" strokeWidth="0.8" />
        <text x="13" y="57" textAnchor="middle" fontSize="8" fill="currentColor" fontFamily="JetBrains Mono,monospace" letterSpacing="0.06em">H</text>

        {/* Depth arrow + label (diagonal cue) */}
        <line x1="104" y1="18" x2="124" y2="8" stroke="currentColor" strokeWidth="0.8" />
        <text x="134" y="14" textAnchor="start" fontSize="8" fill="currentColor" fontFamily="JetBrains Mono,monospace" letterSpacing="0.06em">D</text>
      </svg>

      <div className="grid grid-cols-3 gap-3">
        {/* Width */}
        <div className="grid gap-1.5">
          <Label htmlFor="dim-width" className="flex items-center gap-1.5">
            <span
              className={[
                'inline-block h-2 w-2 flex-shrink-0 rounded-full',
                !isEstimated ? 'bg-green-500' : 'bg-amber-400',
              ].join(' ')}
              title={
                !isEstimated
                  ? `Measured from ${measurement?.reference_type === 'card' ? 'credit card' : 'coin'}`
                  : 'Estimated — no reference object detected'
              }
              aria-label={!isEstimated ? 'Measured' : 'Estimated'}
            />
            Width ({unitLabel(unit)})
          </Label>
          <Input
            id="dim-width"
            type="number"
            min={0}
            step={step}
            value={toDisplayValue(dims.width_mm, unit)}
            onChange={(event) => setWidth(event.target.valueAsNumber)}
            onKeyDown={(event) => nudge(toDisplayValue(dims.width_mm, unit), event, setWidth)}
          />
          <input
            type="range"
            min={unit === 'inch' ? 0.039 : 1}
            max={unit === 'inch' ? 39.37 : 1000}
            step={step}
            value={toDisplayValue(dims.width_mm, unit)}
            onChange={(event) => setWidth(event.target.valueAsNumber)}
            className="w-full cursor-pointer accent-primary"
            aria-label="Width slider"
          />
        </div>

        {/* Height */}
        <div className="grid gap-1.5">
          <Label htmlFor="dim-height" className="flex items-center gap-1.5">
            <span
              className={[
                'inline-block h-2 w-2 flex-shrink-0 rounded-full',
                !isEstimated ? 'bg-green-500' : 'bg-amber-400',
              ].join(' ')}
              title={
                !isEstimated
                  ? `Measured from ${measurement?.reference_type === 'card' ? 'credit card' : 'coin'}`
                  : 'Estimated — no reference object detected'
              }
              aria-label={!isEstimated ? 'Measured' : 'Estimated'}
            />
            Height ({unitLabel(unit)})
          </Label>
          <Input
            id="dim-height"
            type="number"
            min={0}
            step={step}
            value={toDisplayValue(dims.height_mm, unit)}
            onChange={(event) => setHeight(event.target.valueAsNumber)}
            onKeyDown={(event) => nudge(toDisplayValue(dims.height_mm, unit), event, setHeight)}
          />
          <input
            type="range"
            min={unit === 'inch' ? 0.039 : 1}
            max={unit === 'inch' ? 39.37 : 1000}
            step={step}
            value={toDisplayValue(dims.height_mm, unit)}
            onChange={(event) => setHeight(event.target.valueAsNumber)}
            className="w-full cursor-pointer accent-primary"
            aria-label="Height slider"
          />
        </div>

        {/* Depth — always estimated from 2D photo */}
        <div className="grid gap-1.5">
          <Label htmlFor="dim-depth" className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-red-400"
              title="Depth is always estimated — 2D photos cannot capture true depth"
              aria-label="Estimated (depth)"
            />
            Depth ({unitLabel(unit)})
          </Label>
          <Input
            id="dim-depth"
            type="number"
            min={0}
            step={step}
            value={toDisplayValue(dims.depth_mm, unit)}
            onChange={(event) => setDepth(event.target.valueAsNumber)}
            onKeyDown={(event) => nudge(toDisplayValue(dims.depth_mm, unit), event, setDepth)}
          />
          <input
            type="range"
            min={unit === 'inch' ? 0.039 : 1}
            max={unit === 'inch' ? 39.37 : 1000}
            step={step}
            value={toDisplayValue(dims.depth_mm, unit)}
            onChange={(event) => setDepth(event.target.valueAsNumber)}
            className="w-full cursor-pointer accent-primary"
            aria-label="Depth slider"
          />
        </div>
      </div>

      <p className="-mt-1 font-mono text-[9px] tracking-[0.08em] text-muted-foreground/70 uppercase">
        ↑↓ nudge ±1 · shift+↑↓ nudge ±0.1
      </p>

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
