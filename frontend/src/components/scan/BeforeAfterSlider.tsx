import { useRef, useState } from 'react'

// Drag-to-reveal comparison between the original uploaded photo (left) and
// the resolved 3D-model render (right). Pointer events cover mouse, trackpad,
// and touch in one path; the before image is clipped via clip-path so neither
// side squishes.
export default function BeforeAfterSlider({
  before,
  after,
  beforeLabel = 'Photo',
  afterLabel = 'Model',
}: {
  before: string
  after: string
  beforeLabel?: string
  afterLabel?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [pos, setPos] = useState(50)

  function updateFromClientX(clientX: number) {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setPos(Math.max(0, Math.min(100, pct)))
  }

  return (
    <div
      ref={containerRef}
      className="relative aspect-square w-full touch-none select-none overflow-hidden rounded-xl border border-border bg-secondary"
      onPointerDown={(event) => {
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        updateFromClientX(event.clientX)
      }}
      onPointerMove={(event) => {
        if (dragging.current) updateFromClientX(event.clientX)
      }}
      onPointerUp={() => {
        dragging.current = false
      }}
    >
      {/* After (right) — full image underneath */}
      <img src={after} alt={afterLabel} draggable={false} className="absolute inset-0 h-full w-full object-cover" />

      {/* Before (left) — clipped to the divider position */}
      <img
        src={before}
        alt={beforeLabel}
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />

      {/* Labels */}
      <span className="absolute left-3 top-3 rounded bg-black/55 px-2 py-0.5 font-mono text-[10px] tracking-[0.16em] text-white/90 uppercase">
        {beforeLabel}
      </span>
      <span className="absolute right-3 top-3 rounded bg-black/55 px-2 py-0.5 font-mono text-[10px] tracking-[0.16em] text-white/90 uppercase">
        {afterLabel}
      </span>

      {/* Divider + handle */}
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -translate-x-1/2 border-l-2 border-primary" />
        <div className="absolute top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-background text-primary shadow-lg">
          <span className="text-xs">⇔</span>
        </div>
      </div>
    </div>
  )
}
