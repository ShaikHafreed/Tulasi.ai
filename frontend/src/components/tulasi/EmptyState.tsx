import type { ReactNode } from 'react'

// Warm on-brand empty state: small illustration + friendly copy + one clear
// next action. Used by Library, Print check, and any other list/panel that
// can be genuinely empty — never a fake-data placeholder.
export function EmptyState({
  icon,
  eyebrow,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="clay corner-ticks p-12 text-center md:p-20">
      {icon !== undefined ? (
        <div className="relative mx-auto flex h-32 w-32 items-center justify-center">{icon}</div>
      ) : (
        <div className="relative mx-auto h-32 w-32">
          <DefaultIcon />
        </div>
      )}
      {eyebrow && <div className="mt-6 font-mono text-[10px] tracking-[0.3em] text-teal uppercase">{eyebrow}</div>}
      <h3 className="mt-3 font-display text-2xl md:text-3xl">{title}</h3>
      {description && <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-7 flex justify-center">{action}</div>}
    </div>
  )
}

function DefaultIcon() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full">
      <g stroke="var(--color-teal)" strokeOpacity="0.6" strokeWidth="1.6" strokeDasharray="6 6" fill="none">
        <path d="M 130 130 L 128 300 Q 128 320 148 322 L 252 322 Q 272 320 272 300 L 270 130 Z" />
        <ellipse cx="200" cy="130" rx="70" ry="16" />
        <path d="M 272 165 Q 320 175 320 220 Q 320 265 272 275" />
      </g>
    </svg>
  )
}
