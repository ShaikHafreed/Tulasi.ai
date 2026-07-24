import { useLayoutEffect, useRef, useState } from 'react'
import GestureStatusIndicator, { type GestureMode } from './gesture/GestureStatusIndicator'

// Ported from the Lovable AppNav: liquid-glass header, numbered mono nav codes,
// a teal sliding indicator, real gesture-status control, and a present button.
// "Assistant" is a real page (ChatPanel rendered in its `embedded` mode) —
// the same single ChatPanel instance also renders as a floating quick-access
// bubble on every other page, so conversation history survives navigation.
export type DashboardView = 'dashboard' | 'scan' | 'assistant' | 'library' | 'print' | 'settings'

const NAV_ITEMS: { id: DashboardView; label: string; short: string; code: string; icon: string }[] = [
  { id: 'dashboard', label: 'dashboard', short: 'Home', code: '01', icon: '◇' },
  { id: 'scan', label: 'new scan', short: 'Scan', code: '02', icon: '＋' },
  { id: 'assistant', label: 'assistant', short: 'Chat', code: '03', icon: '◐' },
  { id: 'library', label: 'library', short: 'Library', code: '04', icon: '▤' },
  { id: 'print', label: 'print check', short: 'Print', code: '05', icon: '◈' },
  { id: 'settings', label: 'settings', short: 'You', code: '06', icon: '○' },
]

export default function Sidebar({
  activeView,
  onSelectView,
  gestureMode,
  onSelectGestureMode,
  onPresent,
}: {
  activeView: DashboardView
  onSelectView: (view: DashboardView) => void
  gestureMode: GestureMode
  onSelectGestureMode: (mode: GestureMode) => void
  onPresent: () => void
}) {
  const itemRefs = useRef<Map<DashboardView, HTMLButtonElement>>(new Map())
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  function moveIndicatorTo(view: DashboardView) {
    const el = itemRefs.current.get(view)
    if (!el) return
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth })
  }

  useLayoutEffect(() => {
    moveIndicatorTo(activeView)
    const onResize = () => moveIndicatorTo(activeView)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView])

  return (
    <>
      <header className="liquid-glass fixed inset-x-0 top-0 z-40 h-14 border-b border-border/60">
        <div className="mx-auto flex h-full max-w-[1400px] items-center gap-4 px-4 sm:gap-8 sm:px-6">
          <div className="flex shrink-0 items-center gap-2 font-mono text-xs tracking-[0.3em] uppercase">
            <span className="inline-block h-2 w-2 bg-teal caret-blink" />
            <span className="text-foreground">tulasi</span>
            <span className="hidden text-muted-foreground sm:inline">.ai</span>
          </div>

          {/* Desktop pill nav — the mobile bottom tab bar below replaces this
              under md, since 6 items + logo + present don't fit a phone width. */}
          <nav
            className="relative hidden items-center md:flex"
            onMouseLeave={() => moveIndicatorTo(activeView)}
          >
            <span
              className="pointer-events-none absolute top-1/2 h-8 -translate-y-1/2 border border-teal/40 bg-teal/10 transition-[left,width] duration-300 ease-out"
              style={{ left: indicator?.left ?? 0, width: indicator?.width ?? 0, opacity: indicator ? 1 : 0 }}
            />
            {NAV_ITEMS.map(({ id, label, code }) => (
              <button
                key={id}
                ref={(el) => {
                  if (el) itemRefs.current.set(id, el)
                }}
                type="button"
                onClick={() => onSelectView(id)}
                onMouseEnter={() => moveIndicatorTo(id)}
                className={`relative z-[1] flex h-8 items-center gap-2 px-3 font-mono text-[10px] tracking-[0.25em] uppercase transition-colors ${
                  activeView === id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="opacity-40">{code}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:block">
              <GestureStatusIndicator mode={gestureMode} onSelect={onSelectGestureMode} />
            </div>
            <button
              type="button"
              onClick={onPresent}
              aria-label="Open full-screen presentation mode"
              className="flex h-8 items-center border border-teal/50 px-2.5 font-mono text-[10px] tracking-[0.3em] text-teal uppercase transition-colors hover:bg-teal hover:text-navy-deep sm:px-3"
            >
              <span className="sm:hidden">▶</span>
              <span className="hidden sm:inline">present →</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar — thumb-reachable, hidden on desktop where the
          pill nav lives. Safe-area padding clears the home-indicator notch. */}
      <nav
        aria-label="Primary mobile navigation"
        className="liquid-glass fixed inset-x-0 bottom-0 z-40 rounded-none border-t border-border/70 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-6">
          {NAV_ITEMS.map(({ id, short, icon }) => {
            const active = activeView === id
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelectView(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-14 min-h-11 w-full flex-col items-center justify-center gap-0.5 text-[10px] tracking-wide transition-colors active:bg-teal/[0.06] ${
                    active ? 'text-teal' : 'text-muted-foreground'
                  }`}
                >
                  <span aria-hidden className="text-base leading-none">
                    {icon}
                  </span>
                  <span className="font-medium">{short}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
