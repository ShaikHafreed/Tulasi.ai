import { useLayoutEffect, useRef, useState } from 'react'
import { Camera, House, Layers, Search, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type DashboardView = 'dashboard' | 'scan' | 'library' | 'settings'

const NAV_ITEMS: { id: DashboardView; label: string; icon: typeof House }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: House },
  { id: 'scan', label: 'New scan', icon: Camera },
  { id: 'library', label: 'Library', icon: Layers },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({
  activeView,
  onSelectView,
  theme,
  onToggleTheme,
}: {
  activeView: DashboardView
  onSelectView: (view: DashboardView) => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}) {
  const navRef = useRef<HTMLElement>(null)
  const itemRefs = useRef<Map<DashboardView, HTMLButtonElement>>(new Map())
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  function moveIndicatorTo(view: DashboardView) {
    const el = itemRefs.current.get(view)
    if (!el) return
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth })
  }

  useLayoutEffect(() => {
    moveIndicatorTo(activeView)
    // Re-measure on resize since offsetLeft/width shift as the nav reflows.
    const onResize = () => moveIndicatorTo(activeView)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView])

  return (
    <header className="fixed inset-x-0 top-0 z-10 h-17 border-b border-border bg-card/70 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-[1120px] items-center gap-7 px-7">
        <div className="flex items-center gap-2 font-display text-[15px] font-semibold">
          <span className="size-1.5 rounded-full bg-brand-coral" />
          TULASI.AI
        </div>

        <nav
          ref={navRef}
          className="relative flex flex-1 items-center gap-1 overflow-x-auto"
          onMouseLeave={() => moveIndicatorTo(activeView)}
        >
          <span
            className="pointer-events-none absolute inset-y-1 rounded-md bg-primary/12 transition-[left,width] duration-300 ease-out"
            style={{
              left: indicator?.left ?? 0,
              width: indicator?.width ?? 0,
              opacity: indicator ? 1 : 0,
            }}
          />
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              ref={(el) => {
                if (el) itemRefs.current.set(id, el)
              }}
              type="button"
              onClick={() => onSelectView(id)}
              onMouseEnter={() => moveIndicatorTo(id)}
              className={cn(
                'relative z-[1] flex h-9.5 shrink-0 items-center gap-2 rounded-md px-3.5 text-sm whitespace-nowrap text-muted-foreground transition-colors',
                activeView === id && 'text-primary',
              )}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3.5">
          <div className="hidden w-40 items-center gap-2 rounded-md border border-border px-3 text-muted-foreground md:flex">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search"
              className="h-9.5 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <span className="rounded border border-border px-1 font-display text-[10px] text-muted-foreground">/</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full font-display text-[11px] tracking-[0.06em] uppercase"
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? 'Day' : 'Night'}
          </Button>
        </div>
      </div>
    </header>
  )
}
