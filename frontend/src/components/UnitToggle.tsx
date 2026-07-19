import { cn } from '@/lib/utils'
import type { Unit } from '@/lib/units'

// Small segmented mm / inch control. Shared by DimensionPanel (per-view) and
// Settings (global) — both write the same persisted preference.
export default function UnitToggle({ unit, onChange }: { unit: Unit; onChange: (unit: Unit) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border text-[11px]">
      {(['mm', 'inch'] as const).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          className={cn(
            'px-2 py-0.5 font-mono transition-colors',
            unit === u ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
          aria-pressed={unit === u}
        >
          {u === 'inch' ? 'in' : 'mm'}
        </button>
      ))}
    </div>
  )
}
