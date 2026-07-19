import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'

/**
 * Split-screen: pretty-but-wrong vs Tulasi-precise. Ported from the Lovable
 * design. Left model warps/drifts off a reference grid; right model snaps to
 * grid lines as the user scrolls past.
 */
export function ComparisonSplit() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })

  const wrongDrift = useTransform(scrollYProgress, [0.2, 0.5, 0.8], [0, 14, 20])
  const wrongSkew = useTransform(scrollYProgress, [0.2, 0.5, 0.8], [0, 4, 7])
  const wrongScale = useTransform(scrollYProgress, [0.2, 0.5, 0.8], [1, 1.06, 1.09])

  const rightSnap = useTransform(scrollYProgress, [0.2, 0.55], [12, 0])
  const rightBadge = useTransform(scrollYProgress, [0.4, 0.55], [0, 1])
  const leftBadge = useTransform(scrollYProgress, [0.4, 0.55], [0, 1])

  return (
    <div ref={ref} className="mx-auto max-w-7xl px-6 py-32 md:py-48">
      <div className="mx-auto max-w-2xl text-center">
        <div className="font-mono text-[10px] tracking-[0.3em] text-teal uppercase">02 · fit_check</div>
        <h2 className="mt-4 font-display text-3xl md:text-5xl leading-tight">
          Pretty renders lie. <span className="text-muted-foreground italic">Dimensions don't.</span>
        </h2>
        <p className="mt-4 text-sm md:text-base text-muted-foreground">
          Every other tool ships a beautiful mesh that's a few millimeters off. Tulasi locks to a reference grid the
          whole way through.
        </p>
      </div>

      <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {/* LEFT — pretty but wrong */}
        <div className="corner-ticks relative aspect-[4/5] md:aspect-square border border-border bg-navy-deep/60 overflow-hidden">
          <GridBackdrop tone="coral" />
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            style={{ x: wrongDrift, skewY: wrongSkew, scale: wrongScale }}
          >
            <MugSilhouette tone="coral" jitter />
          </motion.div>
          <motion.div
            style={{ opacity: leftBadge }}
            className="absolute bottom-4 left-4 right-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em]"
          >
            <span className="text-coral">Δ 4.7mm off</span>
            <span className="text-muted-foreground">competitor · looks_ok.glb</span>
          </motion.div>
          <div className="absolute top-4 left-4 font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            A / pretty
          </div>
        </div>

        {/* RIGHT — Tulasi, snaps to grid */}
        <div className="corner-ticks relative aspect-[4/5] md:aspect-square border border-teal/50 bg-navy-deep/60 overflow-hidden">
          <GridBackdrop tone="teal" />
          <motion.div className="absolute inset-0 flex items-center justify-center" style={{ x: rightSnap }}>
            <MugSilhouette tone="teal" />
          </motion.div>
          <motion.div
            style={{ opacity: rightBadge }}
            className="absolute bottom-4 left-4 right-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em]"
          >
            <span className="text-teal">Δ 0.0mm · locked</span>
            <span className="text-muted-foreground">tulasi · fit_true.glb</span>
          </motion.div>
          <div className="absolute top-4 left-4 font-mono text-[10px] tracking-[0.2em] uppercase text-teal">
            B / precise
          </div>
        </div>
      </div>
    </div>
  )
}

function GridBackdrop({ tone }: { tone: 'teal' | 'coral' }) {
  const color = tone === 'teal' ? 'var(--color-teal)' : 'var(--color-coral)'
  return (
    <div
      aria-hidden
      className="absolute inset-0 opacity-30"
      style={{
        backgroundImage: `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)`,
        backgroundSize: '32px 32px',
        maskImage: 'radial-gradient(circle at center, black 60%, transparent 100%)',
      }}
    />
  )
}

function MugSilhouette({ tone, jitter }: { tone: 'teal' | 'coral'; jitter?: boolean }) {
  const color = tone === 'teal' ? 'var(--color-teal)' : 'var(--color-coral)'
  return (
    <svg viewBox="0 0 400 400" className="h-3/4 w-3/4">
      <g stroke={color} strokeWidth={jitter ? 1.4 : 1.2} fill="none" opacity="0.95" filter={jitter ? 'url(#jitter)' : undefined}>
        {jitter && (
          <defs>
            <filter id="jitter">
              <feTurbulence baseFrequency="0.6" numOctaves="1" seed="7" />
              <feDisplacementMap in="SourceGraphic" scale="2" />
            </filter>
          </defs>
        )}
        <ellipse cx="200" cy="130" rx="70" ry="16" />
        <path d="M 130 130 L 128 300 Q 128 320 148 322 L 252 322 Q 272 320 272 300 L 270 130" />
        <path d="M 272 165 Q 320 175 320 220 Q 320 265 272 275" />
        <path d="M 148 322 Q 200 332 252 322" opacity="0.5" />
      </g>
    </svg>
  )
}
