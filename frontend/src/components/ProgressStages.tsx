import { Progress } from '@/components/ui/progress'
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
    <div className="flex w-full flex-col gap-3">
      <p className="text-sm text-slate-300">{job.stage}…</p>
      <Progress value={percent} />
    </div>
  )
}
