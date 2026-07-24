import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dismissOnboarding, useOnboarding } from '@/lib/onboarding'

// Dismissible first-run checklist. Every item reflects a real action — a
// saved scan, a gesture toggle, an export — never fake progress. Hides itself
// once dismissed or once all three are genuinely complete, and never returns.
export default function OnboardingChecklist({
  hasScans,
  onGoToScan,
}: {
  hasScans: boolean
  onGoToScan: () => void
}) {
  const { uploaded, gesture, exported, dismissed, allDone } = useOnboarding(hasScans)

  if (dismissed || allDone) return null

  const items = [
    { done: uploaded, label: 'Upload your first photo', hint: 'Start one from New scan.' },
    { done: gesture, label: 'Try gesture control', hint: 'Enable it in Settings, then wave at your webcam.' },
    { done: exported, label: 'Export a model', hint: 'Download an STL from a finished scan.' },
  ]
  const doneCount = items.filter((item) => item.done).length
  const pct = Math.round((doneCount / items.length) * 100)

  return (
    <div className="clay corner-ticks mb-6 p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[10px] tracking-[0.3em] text-teal uppercase">00 · getting started</div>
          <h2 className="mt-1.5 font-display text-xl leading-tight md:text-2xl">
            Three small moves, <span className="italic text-muted-foreground">then you're calibrated.</span>
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
            {doneCount}/{items.length}
          </span>
          <button
            type="button"
            onClick={dismissOnboarding}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dismiss checklist"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="relative mt-4 h-1 overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 rounded-full bg-sage transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>

      <ul className="mt-5 grid gap-2 sm:grid-cols-3">
        {items.map((item, i) => (
          <li
            key={item.label}
            className={`rounded-2xl border p-4 transition-colors ${
              item.done ? 'border-sage/30 bg-sage/[0.06]' : 'border-border bg-background/60'
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  item.done ? 'border-sage bg-sage text-primary-foreground' : 'border-border bg-background text-muted-foreground'
                }`}
              >
                {item.done && <Check size={12} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase">0{i + 1}</span>
                  <h3 className={`text-sm font-medium ${item.done ? 'text-muted-foreground line-through decoration-sage/60' : ''}`}>
                    {item.label}
                  </h3>
                </div>
                {!item.done && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.hint}</p>}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {!uploaded && (
        <Button variant="warm" size="sm" className="mt-4 w-fit" onClick={onGoToScan}>
          Upload a photo
        </Button>
      )}
    </div>
  )
}
