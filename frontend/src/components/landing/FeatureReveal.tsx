import { motion } from 'framer-motion'

// Ported from the Lovable design. Alternating feature rows with technical
// SVG visuals.
type Feature = {
  id: string
  n: string
  title: string
  body: string
  side: 'left' | 'right'
  size: 'sm' | 'md' | 'lg'
  visual: 'mesh' | 'topology' | 'export' | 'constraints'
}

const features: Feature[] = [
  {
    id: 'topology',
    n: 'F.01',
    title: 'Print-ready topology, first pass.',
    body: "Quads where they matter, tris where they don't. No retopo step, no cleanup, no manifold errors at slice time.",
    side: 'left',
    size: 'lg',
    visual: 'topology',
  },
  {
    id: 'constraints',
    n: 'F.02',
    title: 'Constraints, not vibes.',
    body: 'Set a wall thickness, a hole diameter, a mounting-hole spacing — Tulasi treats them as hard constraints, not suggestions.',
    side: 'right',
    size: 'md',
    visual: 'constraints',
  },
  {
    id: 'mesh',
    n: 'F.03',
    title: 'Low-poly & hero-poly, one model.',
    body: 'Ship the same asset to a game engine and a CNC. LODs generated in the same solve.',
    side: 'left',
    size: 'md',
    visual: 'mesh',
  },
  {
    id: 'export',
    n: 'F.04',
    title: 'Every format your pipeline eats.',
    body: '.glb, .step, .stl, .fbx, .usdz — with dimensions baked in as metadata, not stripped.',
    side: 'right',
    size: 'lg',
    visual: 'export',
  },
]

export function FeatureReveal() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-32 md:py-48">
      <div className="max-w-2xl">
        <div className="font-mono text-[10px] tracking-[0.3em] text-teal uppercase">04 · capabilities</div>
        <h2 className="mt-4 font-display text-3xl md:text-5xl leading-tight">
          The things <span className="italic text-muted-foreground">under</span> the pretty picture.
        </h2>
      </div>

      <div className="mt-20 flex flex-col gap-24 md:gap-32">
        {features.map((f, i) => (
          <FeatureRow key={f.id} feature={f} index={i} />
        ))}
      </div>
    </div>
  )
}

function FeatureRow({ feature, index }: { feature: Feature; index: number }) {
  const isLeft = feature.side === 'left'
  const widthClass = feature.size === 'lg' ? 'md:col-span-7' : feature.size === 'md' ? 'md:col-span-6' : 'md:col-span-5'
  const offsetClass = isLeft ? 'md:col-start-1' : 'md:col-start-6'

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      viewport={{ once: true, margin: '-15%' }}
      className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center"
    >
      <div className={`${widthClass} ${offsetClass} order-2 ${isLeft ? 'md:order-1' : 'md:order-2'}`}>
        <FeatureVisual visual={feature.visual} />
      </div>
      <div
        className={`md:col-span-5 ${isLeft ? 'md:col-start-8' : 'md:col-start-1 md:row-start-1'} order-1 ${
          isLeft ? 'md:order-2' : 'md:order-1'
        }`}
      >
        <div className="font-mono text-[10px] tracking-[0.3em] text-coral uppercase">
          {feature.n} · {String(index + 1).padStart(2, '0')}/{String(features.length).padStart(2, '0')}
        </div>
        <h3 className="mt-3 font-display text-2xl md:text-3xl leading-tight">{feature.title}</h3>
        <p className="mt-3 text-sm md:text-base text-muted-foreground max-w-md leading-relaxed">{feature.body}</p>
      </div>
    </motion.div>
  )
}

function FeatureVisual({ visual }: { visual: Feature['visual'] }) {
  switch (visual) {
    case 'topology':
      return (
        <div className="corner-ticks relative aspect-[16/10] border border-border bg-navy-deep/60 overflow-hidden">
          <svg viewBox="0 0 400 250" className="absolute inset-0 h-full w-full">
            <g stroke="var(--color-teal)" strokeWidth="0.6" fill="none" opacity="0.9">
              {Array.from({ length: 22 }).map((_, i) => (
                <line key={`h${i}`} x1="0" y1={i * 12} x2="400" y2={i * 12} opacity={0.25 + (i % 3) * 0.15} />
              ))}
              {Array.from({ length: 34 }).map((_, i) => (
                <line key={`v${i}`} x1={i * 12} y1="0" x2={i * 12} y2="250" opacity={0.15} />
              ))}
              <path d="M 40 200 Q 200 40 360 200" strokeWidth="1.4" />
              <path d="M 60 210 Q 200 70 340 210" strokeWidth="1" opacity="0.55" />
              <path d="M 80 218 Q 200 100 320 218" strokeWidth="0.8" opacity="0.35" />
            </g>
          </svg>
          <div className="absolute bottom-3 left-3 font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            quads · 2,148
          </div>
        </div>
      )
    case 'constraints':
      return (
        <div className="corner-ticks relative aspect-square border border-border bg-navy-deep/60 overflow-hidden">
          <svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full">
            <g stroke="var(--color-teal)" strokeWidth="1.4" fill="none">
              <rect x="60" y="80" width="180" height="140" />
              <circle cx="100" cy="120" r="10" />
              <circle cx="200" cy="120" r="10" />
              <circle cx="100" cy="180" r="10" />
              <circle cx="200" cy="180" r="10" />
            </g>
            <g stroke="var(--color-coral)" strokeWidth="0.8" fill="none">
              <line x1="100" y1="60" x2="200" y2="60" />
              <line x1="100" y1="55" x2="100" y2="65" />
              <line x1="200" y1="55" x2="200" y2="65" />
              <line x1="260" y1="120" x2="260" y2="180" />
              <line x1="255" y1="120" x2="265" y2="120" />
              <line x1="255" y1="180" x2="265" y2="180" />
            </g>
            <g fontFamily="var(--font-mono)" fontSize="10" fill="var(--color-coral)">
              <text x="140" y="52">100.0</text>
              <text x="265" y="154">60.0</text>
            </g>
          </svg>
          <div className="absolute bottom-3 left-3 font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            constraints · 4 locked
          </div>
        </div>
      )
    case 'mesh':
      return (
        <div className="corner-ticks relative aspect-[5/4] border border-border bg-navy-deep/60 overflow-hidden flex">
          {[80, 240, 800].map((n, i) => (
            <div key={n} className="flex-1 relative border-r border-border last:border-r-0 p-4">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <g stroke="var(--color-teal)" strokeWidth="0.4" fill="none" opacity={0.8}>
                  {Array.from({ length: 6 + i * 3 }).map((_, k) => (
                    <circle key={k} cx="50" cy="55" r={5 + k * (30 / (6 + i * 3))} />
                  ))}
                  <line x1="20" y1="55" x2="80" y2="55" />
                  <line x1="50" y1="15" x2="50" y2="90" />
                </g>
              </svg>
              <div className="absolute bottom-2 left-2 font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
                lod{i} · {n}t
              </div>
            </div>
          ))}
        </div>
      )
    case 'export':
      return (
        <div className="corner-ticks relative aspect-[16/10] border border-border bg-navy-deep/60 overflow-hidden p-6">
          <div className="grid grid-cols-3 gap-3 h-full">
            {[
              { ext: '.glb', note: 'web · game' },
              { ext: '.step', note: 'cad' },
              { ext: '.stl', note: 'print' },
              { ext: '.fbx', note: 'dcc' },
              { ext: '.usdz', note: 'ar' },
              { ext: '.obj', note: 'legacy' },
            ].map((f) => (
              <div
                key={f.ext}
                className="border border-teal/30 bg-navy-deep/60 p-3 flex flex-col justify-between hover:border-teal transition-colors"
              >
                <div className="font-mono text-lg text-teal">{f.ext}</div>
                <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-muted-foreground">{f.note}</div>
              </div>
            ))}
          </div>
        </div>
      )
  }
}
