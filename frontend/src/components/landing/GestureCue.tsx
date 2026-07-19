import { motion } from 'framer-motion'

/** Stylized hand rotating the hero object, with a subtle motion trail.
 * Ported from the Lovable design. */
export function GestureCue() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-32 md:py-40">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-5">
          <div className="font-mono text-[10px] tracking-[0.3em] text-teal uppercase">05 · input / gesture</div>
          <h2 className="mt-4 font-display text-3xl md:text-4xl leading-tight">
            Turn it in the air. <br />
            <span className="text-teal">The model turns with you.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-sm md:text-base leading-relaxed max-w-md">
            Webcam or optional glove — Tulasi tracks your hand and orbits the model in real time. No mouse
            choreography, no gimbal, no wasted keystrokes. Rotate, scale, section — with your hand.
          </p>
          <div className="mt-6 flex items-center gap-3 font-mono text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
            <span className="border border-border px-2 py-1">webcam</span>
            <span className="border border-border px-2 py-1">glove · beta</span>
            <span className="border border-border px-2 py-1">quest 3</span>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="corner-ticks relative aspect-[16/11] border border-border bg-navy-deep/60 overflow-hidden">
            {/* motion trail arcs */}
            <svg viewBox="0 0 600 400" className="absolute inset-0 h-full w-full">
              {[0.2, 0.4, 0.6, 0.8].map((o, i) => (
                <motion.path
                  key={i}
                  d="M 180 260 Q 300 60 460 220"
                  stroke="var(--color-teal)"
                  strokeWidth="1"
                  fill="none"
                  opacity={o * 0.6}
                  strokeDasharray="4 6"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  transition={{ duration: 1.6 + i * 0.15, ease: 'easeOut' }}
                  viewport={{ once: true }}
                />
              ))}
              {/* object */}
              <g transform="translate(300 200)">
                <motion.g
                  initial={{ rotate: -20 }}
                  whileInView={{ rotate: 20 }}
                  transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                  viewport={{ once: false }}
                >
                  <g stroke="var(--color-teal)" strokeWidth="1.4" fill="none">
                    <ellipse cx="0" cy="-50" rx="45" ry="10" />
                    <path d="M -45 -50 L -47 60 Q -47 74 -33 76 L 33 76 Q 47 74 47 60 L 45 -50" />
                    <path d="M 47 -25 Q 80 -18 80 12 Q 80 42 47 50" />
                  </g>
                </motion.g>
              </g>
              {/* stylized hand */}
              <g transform="translate(430 180)" stroke="var(--color-coral)" strokeWidth="1.4" fill="none">
                <motion.g
                  initial={{ rotate: -10, x: 0 }}
                  whileInView={{ rotate: 10, x: -8 }}
                  transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                  viewport={{ once: false }}
                >
                  <path d="M 20 40 Q 10 10 30 -10 Q 55 -30 70 -10 L 80 40 Q 80 60 60 65 L 30 65 Q 15 60 20 40 Z" />
                  <circle cx="30" cy="-10" r="3" />
                  <circle cx="50" cy="-25" r="3" />
                  <circle cx="70" cy="-10" r="3" />
                  <path d="M 20 30 Q 0 30 -8 15" />
                </motion.g>
              </g>
              {/* pinch indicator */}
              <motion.circle
                cx="345"
                cy="170"
                r="16"
                stroke="var(--color-coral)"
                strokeWidth="0.8"
                fill="none"
                initial={{ opacity: 0, scale: 0.6 }}
                whileInView={{ opacity: [0, 1, 0], scale: [0.6, 1.4, 2] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                viewport={{ once: false }}
              />
            </svg>

            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              <span className="text-coral flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 bg-coral caret-blink" />
                tracking · 60fps
              </span>
              <span>gesture · rotate_y</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
