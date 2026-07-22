import type { JobRecord } from '@/lib/types'

const STAGE_PERCENT: Record<string, number> = {
  Queued: 10,
  'Analyzing photo': 35,
  'Building geometry': 65,
  Texturing: 90,
}

const STAGE_ORDER = ['Analyzing photo', 'Building geometry', 'Texturing']

export default function ProgressStages({ job }: { job: JobRecord }) {
  const percent = STAGE_PERCENT[job.stage] ?? 50

  return (
    <div className="scanline clay corner-ticks w-full max-w-md p-6">
      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
        <span className="flex items-center gap-2 text-teal">
          <span className="inline-block h-1.5 w-1.5 bg-teal caret-blink" />
          generating
        </span>
        <span className="tabular-nums text-teal">{String(percent).padStart(3, '0')}%</span>
      </div>

      <p className="mt-3 font-display text-lg">{job.stage}…</p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-navy-deep/60">
        <div className="h-full rounded-full bg-teal transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
      </div>

      <div className="mt-4 flex flex-col gap-1.5 font-mono text-[10px] tracking-[0.2em] uppercase">
        {STAGE_ORDER.map((stage) => {
          const current = stage === job.stage
          const done = (STAGE_PERCENT[stage] ?? 100) < percent
          return (
            <div key={stage} className={`flex items-center gap-2 ${current ? 'text-teal' : done ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
              <span>{current || done ? '›' : '·'}</span>
              {stage}
            </div>
          )
        })}
      </div>
    </div>
  )
}
