import type { JobRecord } from '@/lib/types'

const STAGE_PERCENT: Record<string, number> = {
  Queued: 10,
  'Analyzing photo': 35,
  'Building geometry': 65,
  Texturing: 90,
}

export default function ProgressStages({ job }: { job: JobRecord }) {
  const percent = STAGE_PERCENT[job.stage] ?? 50

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <p className="text-sm text-muted-foreground">{job.stage}…</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
