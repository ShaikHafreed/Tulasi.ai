import type { ReactNode } from 'react'

// Ported from the Lovable design — technical-instrument readout tiles and a
// numbered section header, reused across the app screens.
export function Readout({
  label,
  value,
  unit,
  delta,
  tone = 'teal',
}: {
  label: string
  value: string | number
  unit?: string
  delta?: string
  tone?: 'teal' | 'coral' | 'muted'
}) {
  const toneCls = tone === 'coral' ? 'text-coral' : tone === 'muted' ? 'text-muted-foreground' : 'text-teal'
  return (
    <div className="clay border border-border px-3 py-2">
      <div className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`font-mono text-lg ${toneCls}`}>{value}</span>
        {unit && <span className="font-mono text-[10px] text-muted-foreground">{unit}</span>}
      </div>
      {delta && <div className="mt-0.5 font-mono text-[9px] tracking-[0.2em] text-coral">{delta}</div>}
    </div>
  )
}

export function SectionHeader({
  code,
  title,
  hint,
  right,
}: {
  code: string
  title: ReactNode
  hint?: string
  right?: ReactNode
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-6">
      <div>
        <div className="font-mono text-[10px] tracking-[0.3em] text-teal uppercase">{code}</div>
        <h1 className="mt-2 font-display text-3xl leading-tight md:text-4xl">{title}</h1>
        {hint && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{hint}</p>}
      </div>
      {right}
    </div>
  )
}
