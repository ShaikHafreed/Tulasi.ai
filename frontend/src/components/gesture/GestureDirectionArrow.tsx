// Live visual feedback for the 1-finger move / 2-finger resize gestures —
// a debug/feedback aid, not a dominant UI element. Renders the EXACT same
// angleDeg driving the actual panView command (see webcamGesture.ts /
// gestureToCommand.ts), not a separate approximation, so what you see here
// is what's actually happening. One component, two tracks (webcam + glove)
// feed it whichever smoothed angle/direction they're currently producing.
const SIZE = 56
const CENTER = SIZE / 2
const RADIUS = 20

export type GestureFeedback = { mode: 'move'; angleDeg: number } | { mode: 'resize'; increasing: boolean } | null

export default function GestureDirectionArrow({ feedback }: { feedback: GestureFeedback }) {
  if (!feedback) return null

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="pointer-events-none"
      aria-hidden
    >
      <circle cx={CENTER} cy={CENTER} r={2} fill="var(--color-teal)" />
      {feedback.mode === 'move' ? <MoveArrow angleDeg={feedback.angleDeg} /> : <ResizeArrow increasing={feedback.increasing} />}
    </svg>
  )
}

function MoveArrow({ angleDeg }: { angleDeg: number }) {
  // Standard math convention in (Y up) → SVG space (Y down) needs the flip.
  const rad = (angleDeg * Math.PI) / 180
  const tipX = CENTER + Math.cos(rad) * RADIUS
  const tipY = CENTER - Math.sin(rad) * RADIUS
  const headRad = 8
  const headAngle = (150 * Math.PI) / 180
  const leftX = tipX + Math.cos(rad + Math.PI - headAngle) * headRad
  const leftY = tipY - Math.sin(rad + Math.PI - headAngle) * headRad
  const rightX = tipX + Math.cos(rad + Math.PI + headAngle) * headRad
  const rightY = tipY - Math.sin(rad + Math.PI + headAngle) * headRad

  return (
    <g stroke="var(--color-teal)" strokeWidth={1.5} fill="none">
      <line x1={CENTER} y1={CENTER} x2={tipX} y2={tipY} strokeDasharray="3 3" />
      <polyline points={`${leftX},${leftY} ${tipX},${tipY} ${rightX},${rightY}`} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  )
}

function ResizeArrow({ increasing }: { increasing: boolean }) {
  const tipY = increasing ? CENTER - RADIUS : CENTER + RADIUS
  const headDir = increasing ? 1 : -1
  return (
    <g stroke="var(--color-teal)" strokeWidth={1.5} fill="none">
      <line x1={CENTER} y1={CENTER} x2={CENTER} y2={tipY} strokeDasharray="3 3" />
      <polyline
        points={`${CENTER - 6},${tipY + headDir * 8} ${CENTER},${tipY} ${CENTER + 6},${tipY + headDir * 8}`}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  )
}
