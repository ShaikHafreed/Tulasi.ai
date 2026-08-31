import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'

export interface TourStep {
  title: string
  description: string
  // data-tour attribute value to spotlight; omit for the welcome/completion
  // steps, which render as a centered card with no target.
  target?: string
}

// Lightweight, dependency-free spotlight tour — no tour library exists in
// this project, and a 7-step sequence doesn't justify adding one. Reuses
// the app's own surfaces (.liquid-glass, Button) rather than a new look.
export default function GuidedTour({
  steps,
  onFinish,
  onSkip,
}: {
  steps: TourStep[]
  onFinish: () => void
  onSkip: () => void
}) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const step = steps[index]
  const isLast = index === steps.length - 1

  // Locate and track the current step's target element. Missing target →
  // treated the same as "no target" (centered card, no spotlight) rather
  // than crashing or blocking the tour.
  useEffect(() => {
    if (!step.target) {
      setRect(null)
      return
    }
    function measure() {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      // Two nav renderings exist (desktop pill / mobile tab bar); only one
      // is ever visible at a given viewport width — pick whichever has size.
      const all = document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`)
      const visible = Array.from(all).find((e) => e.offsetWidth > 0 && e.offsetHeight > 0) ?? el
      setRect(visible ? visible.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step.target])

  useEffect(() => {
    nextRef.current?.focus()
  }, [index])

  function next() {
    if (isLast) onFinish()
    else setIndex((i) => i + 1)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onSkip()
    else if (event.key === 'ArrowRight' || event.key === 'Enter') next()
    else if (event.key === 'ArrowLeft' && index > 0) setIndex((i) => i - 1)
  }

  // Positioning: prefer below the target, flip above if there's no room,
  // fall back to a bottom sheet on mobile widths where a floating tooltip
  // can't reliably fit next to the spotlighted element.
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const tooltipStyle: CSSProperties = (() => {
    if (!rect || isMobile) return {}
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow > 180 ? rect.bottom + 12 : Math.max(12, rect.top - 172)
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - 336)
    return { top, left }
  })()

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Guided tour"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[100]"
    >
      {/* Dimmed backdrop with a cut-out around the target, via a huge
          box-shadow rather than a separate overlay + mask element. */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[101] rounded-lg transition-all duration-300 ease-out"
        style={
          rect
            ? {
                top: rect.top - 6,
                left: rect.left - 6,
                width: rect.width + 12,
                height: rect.height + 12,
                boxShadow: '0 0 0 9999px rgba(20,16,12,0.6)',
              }
            : { top: 0, left: 0, width: 0, height: 0, boxShadow: '0 0 0 9999px rgba(20,16,12,0.6)' }
        }
      />

      <div
        className={
          isMobile
            ? 'liquid-glass fixed inset-x-0 bottom-0 z-[102] rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]'
            : rect
              ? 'liquid-glass fixed z-[102] w-80 p-5'
              : 'liquid-glass fixed top-1/2 left-1/2 z-[102] w-80 -translate-x-1/2 -translate-y-1/2 p-5'
        }
        style={!isMobile ? tooltipStyle : undefined}
      >
        <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
          <span>
            {index + 1} of {steps.length}
          </span>
          <button type="button" onClick={onSkip} className="hover:text-foreground">
            Skip tour
          </button>
        </div>
        <p className="mt-2 font-display text-lg">{step.title}</p>
        <p className="mt-1.5 text-sm text-muted-foreground">{step.description}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          {index > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setIndex((i) => i - 1)}>
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="warm" size="sm" onClick={next} ref={nextRef}>
            {isLast ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  )
}
