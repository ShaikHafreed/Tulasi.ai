import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useIsMobile } from '@/lib/useIsMobile'

// Ported from the Lovable design, wired to REAL gesture state. off /
// webcam-active / glove-linked reflect the actual persisted toggles, and
// selecting one flips them (webcam and glove are mutually exclusive here).
//
// Uses Radix DropdownMenu (portals to document.body) rather than a hand-rolled
// absolutely-positioned dropdown — the nav header uses `backdrop-filter`
// (.liquid-glass), which creates its own stacking/containing context, and a
// dropdown positioned relative to an element inside that context can render
// clipped near the header's edge in some browsers. Portaling out of the
// header sidesteps that entire class of issue regardless of the exact cause.
export type GestureMode = 'off' | 'webcam' | 'glove'

const LABELS: Record<GestureMode, { label: string; hint: string; color: string; dot: string }> = {
  off: { label: 'gesture · off', hint: 'no tracking', color: 'text-muted-foreground border-border', dot: 'bg-muted-foreground/60' },
  webcam: { label: 'webcam · active', hint: 'hand tracking', color: 'text-teal border-teal/50', dot: 'bg-teal' },
  glove: { label: 'glove · linked', hint: '6-dof · low-latency', color: 'text-coral border-coral/50', dot: 'bg-coral' },
}

export default function GestureStatusIndicator({
  mode,
  onSelect,
}: {
  mode: GestureMode
  onSelect: (mode: GestureMode) => void
}) {
  const meta = LABELS[mode]
  const isMobile = useIsMobile()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-8 items-center gap-2 border bg-transparent px-3 font-mono text-[10px] tracking-[0.25em] uppercase transition-colors ${meta.color}`}
        >
          <span className="relative inline-flex h-1.5 w-1.5">
            {mode !== 'off' && <span className={`absolute inset-0 rounded-full ${meta.dot} animate-ping opacity-60`} />}
            <span className={`relative inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          </span>
          {meta.label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">
        <div className="px-2 py-2 font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase">input source</div>
        {(['off', 'webcam', 'glove'] as GestureMode[]).map((m) => {
          const active = m === mode
          const info = LABELS[m]
          const disabled = m === 'webcam' && isMobile
          return (
            <DropdownMenuItem
              key={m}
              disabled={disabled}
              onClick={() => !disabled && onSelect(m)}
              className="flex-col items-stretch gap-0 py-2"
            >
              <div className="flex w-full items-center gap-3">
                <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${disabled ? 'bg-muted-foreground/30' : info.dot}`} />
                <div className="flex-1">
                  <div
                    className={`font-mono text-[10px] tracking-[0.2em] uppercase ${
                      disabled ? 'text-muted-foreground/50' : active ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {info.label}
                  </div>
                  <div className="mt-0.5 font-mono text-[9px] text-muted-foreground/70">
                    {disabled ? 'needs a larger screen' : info.hint}
                  </div>
                </div>
                {active && !disabled && <span className="text-xs text-teal">●</span>}
              </div>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
