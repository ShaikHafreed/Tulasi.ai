import { useLayoutEffect, useRef, useState } from 'react'
import GestureStatusIndicator, { type GestureMode } from './gesture/GestureStatusIndicator'

// Ported from the Lovable AppNav: liquid-glass header, numbered mono nav codes,
// a teal sliding indicator, real gesture-status control, and a present button.
// "Assistant" (03) isn't a DashboardView page — Tulasi's assistant is a real,
// tested floating panel (ChatPanel), not a full-screen route, so the nav item
// just opens it rather than switching pages; it's rendered inline below,
// styled to match but excluded from the page-indicator tracking.
export type DashboardView = 'dashboard' | 'scan' | 'library' | 'print' | 'settings'

const NAV_ITEMS: { id: DashboardView; label: string; code: string }[] = [
  { id: 'dashboard', label: 'dashboard', code: '01' },
  { id: 'scan', label: 'new scan', code: '02' },
]
const NAV_ITEMS_AFTER_ASSISTANT: { id: DashboardView; label: string; code: string }[] = [
  { id: 'library', label: 'library', code: '04' },
  { id: 'print', label: 'print check', code: '05' },
  { id: 'settings', label: 'settings', code: '06' },
]

export default function Sidebar({
  activeView,
  onSelectView,
  gestureMode,
  onSelectGestureMode,
  onPresent,
  onOpenAssistant,
}: {
  activeView: DashboardView
  onSelectView: (view: DashboardView) => void
  gestureMode: GestureMode
  onSelectGestureMode: (mode: GestureMode) => void
  onPresent: () => void
  onOpenAssistant: () => void
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
    <header className="liquid-glass fixed inset-x-0 top-0 z-40 h-14 border-b border-border/60">
      <div className="mx-auto flex h-full max-w-[1400px] items-center gap-8 px-6">
        <div className="flex items-center gap-2 font-mono text-xs tracking-[0.3em] uppercase">
          <span className="inline-block h-2 w-2 bg-teal caret-blink" />
          <span className="text-foreground">tulasi</span>
          <span className="text-muted-foreground">.ai</span>
        </div>

        <nav className="relative flex items-center" onMouseLeave={() => moveIndicatorTo(activeView)}>
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
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={onOpenAssistant}
            onMouseEnter={() => moveIndicatorTo(activeView)}
            className="relative z-[1] flex h-8 items-center gap-2 px-3 font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase transition-colors hover:text-foreground"
          >
            <span className="opacity-40">03</span>
            <span className="hidden sm:inline">assistant</span>
          </button>
          {NAV_ITEMS_AFTER_ASSISTANT.map(({ id, label, code }) => (
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
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <GestureStatusIndicator mode={gestureMode} onSelect={onSelectGestureMode} />
          <button
            type="button"
            onClick={onPresent}
            className="flex h-8 items-center border border-teal/50 px-3 font-mono text-[10px] tracking-[0.3em] text-teal uppercase transition-colors hover:bg-teal hover:text-navy-deep"
          >
            present →
          </button>
        </div>
      </div>
    </header>
  )
}
