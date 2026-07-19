import { motion } from 'framer-motion'

/** Bookend: the hero object returns, fully resolved and confident. Ported
 * from the Lovable design. The email form opens the real AuthCard sign-up
 * dialog instead of the original mock submit. */
export function ClosingCTA({ onRequestAccess }: { onRequestAccess: () => void }) {
  return (
    <div id="cta" className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-6 py-32 md:py-48 text-center">
        <div className="font-mono text-[10px] tracking-[0.3em] text-teal uppercase">07 · begin</div>

        <div className="mt-10 flex justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            viewport={{ once: true }}
            className="relative"
          >
            <svg viewBox="0 0 400 400" className="w-48 md:w-64 h-48 md:h-64">
              <defs>
                <linearGradient id="mugFill" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#1f3a4a" />
                  <stop offset="100%" stopColor="#141d2c" />
                </linearGradient>
                <linearGradient id="mugStroke" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-teal)" />
                  <stop offset="100%" stopColor="var(--color-teal-dim)" />
                </linearGradient>
              </defs>
              <g stroke="url(#mugStroke)" strokeWidth="1.4" fill="url(#mugFill)">
                <path d="M 130 130 L 128 300 Q 128 320 148 322 L 252 322 Q 272 320 272 300 L 270 130 Z" />
                <ellipse cx="200" cy="130" rx="70" ry="16" fill="#0b0f1a" stroke="var(--color-teal)" />
                {/* handle — attached to the outer wall, bulging outward */}
                <path d="M 272 165 Q 320 175 320 220 Q 320 265 272 275" fill="none" />
              </g>
            </svg>
            <div className="absolute -right-4 md:-right-16 top-6 font-mono text-[10px] tracking-[0.2em] uppercase text-teal">
              <div>w · 092.0 mm</div>
              <div>h · 108.0 mm</div>
              <div>d · 092.0 mm</div>
              <div className="text-coral mt-1">Δ 0.0 · true</div>
            </div>
          </motion.div>
        </div>

        <h2 className="mt-14 font-display text-4xl md:text-6xl lg:text-7xl leading-[1.02] max-w-4xl mx-auto">
          Sketch it. <span className="text-teal">Fit it.</span> <span className="italic text-muted-foreground">Ship it.</span>
        </h2>
        <p className="mt-5 max-w-xl mx-auto text-muted-foreground">
          Tulasi is opening early access in waves. Bring one object you can't get right in Meshy — we'll make it fit.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onRequestAccess()
          }}
          className="mt-10 mx-auto flex max-w-md gap-2"
        >
          <input
            type="email"
            placeholder="you@studio.com"
            className="flex-1 border border-border bg-transparent px-4 py-3 font-mono text-sm placeholder:text-muted-foreground/60 focus:border-teal focus:outline-none"
          />
          <button
            type="submit"
            className="group inline-flex items-center gap-2 border border-teal bg-teal text-navy-deep px-5 py-3 font-mono text-xs uppercase tracking-[0.2em] hover:brightness-110"
          >
            Request →
          </button>
        </form>

        <div className="mt-6 font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          tulasi.ai · precision 3d · ©{new Date().getFullYear()}
        </div>
      </div>
    </div>
  )
}
