import { useEffect, useState } from 'react'

const TARGET_VALUE = 127
const COUNT_DURATION_MS = 650
const WORDMARK_AT_MS = 950
const DONE_AT_MS = 1500

type Phase = 'measuring' | 'wordmark' | 'done'

export default function DimensionLoader({ onComplete }: { onComplete: () => void }) {
  const [value, setValue] = useState(0)
  const [phase, setPhase] = useState<Phase>('measuring')

  useEffect(() => {
    const start = performance.now()
    let frame: number

    function tick(now: number) {
      const progress = Math.min((now - start) / COUNT_DURATION_MS, 1)
      setValue(Math.round(progress * TARGET_VALUE))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    const toWordmark = setTimeout(() => setPhase('wordmark'), WORDMARK_AT_MS)
    const toDone = setTimeout(() => {
      setPhase('done')
      onComplete()
    }, DONE_AT_MS)

    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(toWordmark)
      clearTimeout(toDone)
    }
  }, [onComplete])

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-navy transition-opacity duration-500 ${
        phase === 'done' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      {phase === 'measuring' && (
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-3 w-36 items-center">
            <span className="absolute left-0 h-3 w-px bg-teal-400" />
            <span className="absolute right-0 h-3 w-px bg-teal-400" />
            <span className="dimension-fill h-px w-full bg-teal-400" />
          </div>
          <span className="font-data text-2xl tabular-nums text-teal-300">
            {value}
            <span className="ml-1 text-sm text-slate-500">mm</span>
          </span>
        </div>
      )}
      {phase === 'wordmark' && (
        <p className="wordmark-in font-display text-2xl font-semibold tracking-[0.3em] text-slate-100">TULASI</p>
      )}
    </div>
  )
}
