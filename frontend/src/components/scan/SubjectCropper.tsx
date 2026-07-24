import { useRef } from 'react'
import type { SubjectBox } from '@/lib/types'

const MIN = 0.06

function clampMove(box: SubjectBox): SubjectBox {
  return {
    ...box,
    x: Math.min(Math.max(box.x, 0), 1 - box.w),
    y: Math.min(Math.max(box.y, 0), 1 - box.h),
  }
}

function clampResize(box: SubjectBox): SubjectBox {
  return {
    ...box,
    w: Math.min(Math.max(box.w, MIN), 1 - box.x),
    h: Math.min(Math.max(box.h, MIN), 1 - box.y),
  }
}

// A draggable + resizable crop box over a photo. Everything outside the box is
// dimmed (box-shadow trick) so it's clear only the inside gets modelled.
export default function SubjectCropper({
  src,
  box,
  onChange,
  label,
}: {
  src: string
  box: SubjectBox
  onChange: (box: SubjectBox) => void
  label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  function norm(clientX: number, clientY: number) {
    const rect = ref.current!.getBoundingClientRect()
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height }
  }

  function begin(event: React.PointerEvent, mode: 'move' | 'resize') {
    event.preventDefault()
    event.stopPropagation()
    const startPoint = norm(event.clientX, event.clientY)
    const startBox = { ...box }

    function onMove(moveEvent: PointerEvent) {
      const p = norm(moveEvent.clientX, moveEvent.clientY)
      const dx = p.x - startPoint.x
      const dy = p.y - startPoint.y
      if (mode === 'move') {
        onChange(clampMove({ ...startBox, x: startBox.x + dx, y: startBox.y + dy }))
      } else {
        onChange(clampResize({ ...startBox, w: startBox.w + dx, h: startBox.h + dy }))
      }
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div ref={ref} className="relative w-full touch-none select-none overflow-hidden rounded-xl border border-border">
      <img src={src} alt={label ?? 'photo'} draggable={false} className="block w-full" />

      <div
        className="absolute border-2 border-primary"
        style={{
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.w * 100}%`,
          height: `${box.h * 100}%`,
          cursor: 'move',
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
        }}
        onPointerDown={(event) => begin(event, 'move')}
      >
        <div
          // The visible dot stays small (size-4); the invisible flex parent
          // is a real ~44px touch target around it — a 16px circle is too
          // small to reliably grab with a finger.
          className="absolute -bottom-4 -right-4 flex size-11 items-center justify-center"
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={(event) => begin(event, 'resize')}
        >
          <div className="pointer-events-none size-4 rounded-full border-2 border-primary bg-background" />
        </div>
      </div>

      {label && (
        <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] tracking-[0.16em] text-white/90 uppercase">
          {label}
        </span>
      )}
    </div>
  )
}
