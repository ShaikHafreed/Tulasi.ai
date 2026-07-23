import { motion, useScroll, useTransform, useSpring } from 'framer-motion'
import { useRef } from 'react'

/**
 * Close-up "calibration moment": object next to a credit card, a dimension
 * line draws itself edge-to-edge, and a number ticks up to a real mm value.
 * The signature feature — heavy visual treatment. Ported from the Lovable
 * design.
 */
export function CalibrationDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 })

  const lineDraw = useTransform(p, [0.25, 0.6], [0, 1])
  const number = useTransform(p, [0.3, 0.75], [0, 85.6])
  const numberText = useTransform(number, (v) => v.toFixed(1))
  const cardAppear = useTransform(p, [0.15, 0.4], [0, 1])
  const cardY = useTransform(cardAppear, [0, 1], [24, 0])
  const rightTickLeft = useTransform(lineDraw, (v) => `${v * 100}%`)
  const lineWidth = useTransform(lineDraw, (v) => `${v * 100}%`)
  const numberLeft = useTransform(lineDraw, (v) => `${v * 50}%`)

  return (
    <div id="calibration" ref={ref} className="mx-auto max-w-7xl px-6 py-32 md:py-48">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
        <div className="lg:col-span-4 order-2 lg:order-1">
          <div className="font-mono text-[10px] tracking-[0.3em] text-teal uppercase">03 · signature / calibration</div>
          <h2 className="mt-4 font-display text-3xl md:text-4xl leading-tight">
            One reference object. <br />
            <span className="text-teal">Every</span> measurement true.
          </h2>
          <p className="mt-5 text-muted-foreground text-sm md:text-base leading-relaxed">
            Put a credit card — or anything ISO/IEC 7810 sized — next to your subject. Tulasi anchors to it, then
            measures the rest of the frame to sub-millimeter precision. No calipers. No guessing. Just{' '}
            <span className="font-mono text-teal">85.60 mm</span>.
          </p>
          <ul className="mt-8 space-y-3 font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
            {[
              ['01', 'detect reference'],
              ['02', 'solve scale'],
              ['03', 'measure object'],
              ['04', 'export .glb + dims'],
            ].map(([n, t]) => (
              <li key={n} className="flex items-center gap-3">
                <span className="text-teal">{n}</span>
                <span className="h-px w-6 bg-teal/40" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-8 order-1 lg:order-2">
          <div className="corner-ticks relative aspect-[4/3] w-full border border-teal/40 bg-navy-deep/70 overflow-hidden">
            {/* subtle noise vignette */}
            <div className="absolute inset-0 opacity-40 [background:radial-gradient(ellipse_at_center,transparent_55%,var(--navy-deep)_100%)]" />

            {/* Grid */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  'linear-gradient(to right, var(--color-teal) 1px, transparent 1px), linear-gradient(to bottom, var(--color-teal) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />

            {/* Scene */}
            <div className="absolute inset-0 flex items-end justify-center gap-10 pb-24 md:pb-28">
              {/* Credit card */}
              <motion.div style={{ opacity: cardAppear, y: cardY }} className="relative">
                <div className="w-40 md:w-56 aspect-[85.6/53.98] rounded-md bg-gradient-to-br from-[#f3ece2] to-[#e3d3bd] border border-teal/40 shadow-[0_10px_40px_-10px_rgba(201,111,74,0.35)] p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="w-7 h-5 rounded-sm bg-gradient-to-br from-coral/80 to-coral/30" />
                    <div className="font-mono text-[8px] tracking-[0.2em] text-teal uppercase">ref · iso7810</div>
                  </div>
                  <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">•••• 85.60 mm</div>
                </div>
                <div className="mt-2 font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground text-center">
                  reference
                </div>
              </motion.div>

              {/* Mug */}
              <div className="relative">
                <svg viewBox="0 0 400 400" className="w-40 md:w-56 h-40 md:h-56">
                  <g stroke="var(--color-teal)" strokeWidth="1.4" fill="none">
                    <ellipse cx="200" cy="130" rx="70" ry="16" />
                    <path d="M 130 130 L 128 300 Q 128 320 148 322 L 252 322 Q 272 320 272 300 L 270 130" />
                    <path d="M 272 165 Q 320 175 320 220 Q 320 265 272 275" />
                    <ellipse cx="200" cy="320" rx="62" ry="12" opacity="0.5" />
                  </g>
                  <g fill="var(--color-teal)">
                    <circle cx="130" cy="130" r="3" />
                    <circle cx="270" cy="130" r="3" />
                  </g>
                </svg>
                <div className="mt-2 font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground text-center">
                  subject
                </div>
              </div>
            </div>

            {/* Dimension line drawing */}
            <div className="absolute left-8 right-8 top-16">
              <div className="relative h-6">
                <div className="absolute left-0 top-0 h-6 w-px bg-coral" />
                <motion.div className="absolute top-0 h-6 w-px bg-coral" style={{ left: rightTickLeft }} />
                <motion.div
                  className="absolute top-1/2 left-0 h-px bg-coral"
                  style={{ width: lineWidth, boxShadow: '0 0 8px rgba(196,98,46,0.55)' }}
                />
                <motion.div className="absolute -top-6 font-mono text-[11px] md:text-xs tracking-[0.15em] text-coral" style={{ left: numberLeft }}>
                  <motion.span>{numberText}</motion.span>
                  <span className="text-muted-foreground"> mm</span>
                </motion.div>
              </div>
            </div>

            {/* HUD */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              <span className="flex items-center gap-2 text-teal">
                <span className="inline-block h-1.5 w-1.5 bg-teal caret-blink" />
                anchored
              </span>
              <span>tolerance · ±0.4mm</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
