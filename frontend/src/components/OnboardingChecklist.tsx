import { Check, Circle, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
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

  return (
    <Card className="mb-6 gap-3 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <p className="font-display text-[11px] tracking-[0.16em] text-primary uppercase">Getting started</p>
          <span className="font-mono text-[11px] text-muted-foreground">{doneCount}/3</span>
        </div>
        <button
          type="button"
          onClick={dismissOnboarding}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Dismiss checklist"
        >
          <X size={15} />
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2.5">
            {item.done ? (
              <Check size={16} className="mt-0.5 shrink-0 text-primary" />
            ) : (
              <Circle size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
            )}
            <div>
              <p className={item.done ? 'text-sm text-muted-foreground line-through' : 'text-sm'}>{item.label}</p>
              {!item.done && <p className="text-xs text-muted-foreground">{item.hint}</p>}
            </div>
          </li>
        ))}
      </ul>

      {!uploaded && (
        <Button variant="warm" size="sm" className="mt-1 w-fit" onClick={onGoToScan}>
          Upload a photo
        </Button>
      )}
    </Card>
  )
}
