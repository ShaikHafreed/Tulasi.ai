import { Check, Loader2 } from 'lucide-react'
import type { JobRecord } from '@/lib/types'

// Stage order matches the backend's reported stage strings
const STAGES: { key: string; label: string; eta: string }[] = [
  { key: 'Queued',            label: 'Queued',    eta: 'Starting up…' },
  { key: 'Analyzing photo',   label: 'Calibrate', eta: 'Detecting reference object · ~2s' },
  { key: 'Building geometry', label: 'Generate',  eta: 'Generating 3D mesh via Meshy · 20–40s' },
  { key: 'Texturing',         label: 'Texture',   eta: 'Applying surface materials · ~10s' },
]

const STAGE_PERCENT: Record<string, number> = {
  Queued: 10,
  'Analyzing photo': 35,
  'Building geometry': 65,
  Texturing: 90,
}

export default function ProgressStages({ job }: { job: JobRecord }) {
  const percent = STAGE_PERCENT[job.stage] ?? 50
  const currentIdx = STAGES.findIndex((s) => s.key === job.stage)

  return (
    <div className="scanline clay corner-ticks w-full max-w-md p-5">
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
        <span className="flex items-center gap-2 text-teal">
          <span className="inline-block h-1.5 w-1.5 bg-teal caret-blink" />
          generating
        </span>
        <span className="tabular-nums text-teal">{String(percent).padStart(3, '0')}%</span>
      </div>

      {/* Horizontal stage timeline */}
      <div className="relative flex items-start justify-between">
        {/* Connecting line track sits behind the circles */}
        <div className="absolute top-3.5 right-0 left-0 h-px bg-border" aria-hidden="true" />
        <div
          className="absolute top-3.5 left-0 h-px bg-teal transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
          aria-hidden="true"
        />

        {STAGES.map((stage, idx) => {
          const isDone    = idx < currentIdx
          const isCurrent = idx === currentIdx
          const isPending = idx > currentIdx

          return (
            <div key={stage.key} className="relative z-10 flex flex-1 flex-col items-center gap-2">
              {/* Step circle */}
              <div
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full border transition-colors duration-300',
                  isDone    ? 'border-teal bg-teal text-navy'                                            : '',
                  isCurrent ? 'border-teal bg-card text-teal shadow-[0_0_0_3px_rgba(179,79,42,0.14)]'  : '',
                  isPending ? 'border-border bg-card text-muted-foreground/35'                          : '',
                ].filter(Boolean).join(' ')}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isDone ? (
                  <Check size={13} strokeWidth={2.5} />
                ) : isCurrent ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <span className="font-mono text-[9px]">{idx + 1}</span>
                )}
              </div>

              {/* Stage label */}
              <span
                className={[
                  'text-center font-mono text-[9px] leading-tight tracking-[0.15em] uppercase',
                  isDone    ? 'text-muted-foreground'    : '',
                  isCurrent ? 'text-teal'               : '',
                  isPending ? 'text-muted-foreground/35' : '',
                ].filter(Boolean).join(' ')}
              >
                {stage.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Active stage ETA — contextual, understated */}
      {currentIdx >= 0 && (
        <p className="mt-4 font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
          {STAGES[currentIdx]?.eta}
        </p>
      )}
    </div>
  )
}
