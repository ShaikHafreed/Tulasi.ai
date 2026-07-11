import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import AuthCard from './AuthCard'

const READINGS = [
  'COFFEE MUG      84.2 × 92.0 × 84.2 mm',
  'PHONE BRACKET   32.0 × 14.5 × 6.0 mm',
  'DOOR HINGE      63.5 × 40.0 × 3.2 mm',
  'PIPE CLAMP      32.0 × 32.0 × 18.0 mm',
]

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.unobserve(node)
        }
      },
      { threshold: 0.15 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} data-reveal className={cn(visible && 'in', className)}>
      {children}
    </div>
  )
}

function CalibrationReadout() {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setText(READINGS[0])
      setDone(true)
      return
    }

    let cancelled = false
    let index = 0
    let current = ''

    function typeText(target: string, onDone: () => void) {
      let pos = 0
      current = target
      const step = () => {
        if (cancelled) return
        pos++
        setText(target.slice(0, pos))
        setDone(pos >= target.length)
        if (pos < target.length) {
          setTimeout(step, 28)
        } else {
          onDone()
        }
      }
      step()
    }

    function eraseText(onDone: () => void) {
      let pos = current.length
      const step = () => {
        if (cancelled) return
        pos--
        setText(current.slice(0, Math.max(pos, 0)))
        setDone(false)
        if (pos > 0) {
          setTimeout(step, 12)
        } else {
          onDone()
        }
      }
      step()
    }

    function cycle() {
      if (cancelled) return
      index = (index + 1) % READINGS.length
      eraseText(() => typeText(READINGS[index], () => setTimeout(cycle, 2200)))
    }

    typeText(READINGS[0], () => setTimeout(cycle, 2200))

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card className="liquid-glass mx-auto mt-14 max-w-lg gap-3 p-6 text-left" data-reveal>
      <div className="flex items-center justify-between font-display text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        <span>Calibration readout</span>
        <span className="flex items-center gap-1.5 text-primary">
          <span className="size-1.5 animate-live-pulse rounded-full bg-primary" />
          Live
        </span>
      </div>
      <div className="min-h-[1.4em] font-display text-base tabular-nums text-foreground">
        <span className="text-primary">{text || ' '}</span>
        {done && <span className="animate-caret ml-0.5 inline-block h-[1.1em] w-2 -translate-y-[-0.1em] bg-brand-coral align-[-0.18em]" />}
      </div>
      <div className="relative mt-2 h-2.5">
        <span className="absolute top-0 left-0 h-2.5 w-px bg-primary" />
        <span className="absolute top-0 right-0 h-2.5 w-px bg-primary" />
        <span className="dimension-fill absolute top-[5px] left-0 h-px w-full bg-primary" />
      </div>
    </Card>
  )
}

export default function LandingPage() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [authMode, setAuthMode] = useState<'sign_in' | 'sign_up' | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [theme])

  return (
    <>
      <nav className="mx-auto flex max-w-[1120px] items-center justify-between px-7 py-7">
        <div className="flex items-center gap-2 font-display text-[15px] font-semibold">
          <span className="size-1.5 rounded-full bg-brand-coral shadow-[0_0_0_3px_rgba(255,122,80,0.18)]" />
          TULASI.AI
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setAuthMode('sign_in')}>
            Sign in
          </Button>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setAuthMode('sign_up')}>
            Sign up
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full font-display text-[11px] tracking-[0.08em] uppercase"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Day mode' : 'Night mode'}
          </Button>
        </div>
      </nav>

      <AuthCard mode={authMode} onOpenChange={(open) => !open && setAuthMode(null)} />

      <header className="mx-auto max-w-[1120px] px-7 pt-16 pb-22 text-center">
        <p className="inline-flex items-center gap-2.5 font-display text-[11px] tracking-[0.16em] text-primary uppercase before:h-px before:w-5 before:bg-current before:opacity-50 after:h-px after:w-5 after:bg-current after:opacity-50">
          Photo → real-world 3D
        </p>
        <h1 className="mx-auto mt-5 max-w-[15ch] text-balance font-display text-4xl font-bold tracking-tight uppercase sm:text-5xl md:text-6xl">
          Meshy makes it look right.
          <br />
          Tulasi makes it <span className="text-brand-coral">FIT</span> right.
        </h1>
        <p className="mx-auto mt-5 max-w-[46ch] text-balance text-lg leading-relaxed text-muted-foreground">
          Photograph any object next to a coin or card. Tulasi calibrates against it and hands back a 3D
          model sized to the millimeter — not a guess dressed up in a nice render.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3.5">
          <Button variant="warm" size="lg">
            Scan your first object
          </Button>
          <Button variant="outline" size="lg" asChild>
            <a href="#compare">See how it's different</a>
          </Button>
        </div>

        <CalibrationReadout />
      </header>

      <section className="mx-auto max-w-[1120px] border-t border-border px-7 py-20" id="compare">
        <div className="text-center">
          <p className="font-display text-[11px] tracking-[0.16em] text-primary uppercase">The actual difference</p>
          <h2 className="mt-3 text-balance font-display text-2xl tracking-tight uppercase">
            Generation quality is commoditized.
            <br />
            Dimensional accuracy isn't.
          </h2>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-9 md:grid-cols-[1fr_1px_1fr]">
          <Reveal>
            <div>
              <p className="border-b border-border pb-4 font-display text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
                Meshy · Tripo · Rodin
              </p>
              {[
                ['Arbitrary scale.', 'The mesh comes out at whatever size the model decided — no link to the real object.'],
                ['No reference check.', 'Nothing in the pipeline knows what "correct size" even means.'],
                ['Print at your own risk.', 'Wall thickness, overhangs, stability — untested until it fails on the plate.'],
              ].map(([bold, rest]) => (
                <div key={bold} className="flex gap-3 py-3 text-[0.95rem] leading-relaxed">
                  <span className="w-4.5 shrink-0 font-display text-muted-foreground">×</span>
                  <span className="text-muted-foreground">
                    <b className="font-semibold text-foreground">{bold}</b> {rest}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>
          <div className="hidden bg-border md:block" />
          <Reveal>
            <div>
              <p className="border-b border-border pb-4 font-display text-[11px] tracking-[0.1em] text-primary uppercase">
                Tulasi
              </p>
              {[
                ['Calibrated scale.', 'A coin or card in frame gives millimeters-per-pixel — every dimension is real.'],
                ['Editable, locked proportions.', 'Resize to a target measurement without distorting the object.'],
                ['Checked before you print.', 'Wall thickness, overhangs, and stability flagged up front.'],
              ].map(([bold, rest]) => (
                <div key={bold} className="flex gap-3 py-3 text-[0.95rem] leading-relaxed">
                  <span className="w-4.5 shrink-0 font-display text-primary">✓</span>
                  <span className="text-muted-foreground">
                    <b className="font-semibold text-foreground">{bold}</b> {rest}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] border-t border-border px-7 py-20">
        <div className="text-center">
          <p className="font-display text-[11px] tracking-[0.16em] text-primary uppercase">How it works</p>
          <h2 className="mt-3 font-display text-2xl tracking-tight uppercase">Four things doing the real work</h2>
        </div>
        <div className="mt-11 grid grid-cols-1 gap-4.5 sm:grid-cols-3">
          {[
            {
              num: '01',
              title: 'Reference-object calibration',
              body: 'A credit card or ₹10 coin in the photo gives Tulasi a known real-world length. Every other measurement is derived from it.',
              span: 'sm:col-span-2',
              clay: 'clay-coral',
            },
            {
              num: '02',
              title: 'Smart dimension lock',
              body: 'Change one dimension to hit a target size and the others scale with it — proportional, not distorted.',
              span: '',
              clay: '',
            },
            {
              num: '03',
              title: 'Print-ready validation',
              body: 'Wall thickness, unsupported overhangs, and base stability, checked against real FDM printing tolerances before export.',
              span: '',
              clay: '',
            },
            {
              num: '04',
              title: 'Context-aware assistant',
              body: '"Make this bracket fit a 32mm pipe" — say it, and watch the model resize in front of you.',
              span: 'sm:col-span-2',
              clay: '',
            },
          ].map((feature) => (
            <Reveal key={feature.num} className={feature.span}>
              <div className={cn('clay flex h-full flex-col gap-2 p-6.5', feature.clay)}>
                <span className="font-display text-[11px] text-muted-foreground">{feature.num}</span>
                <h3 className="text-[1.05rem] font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] border-t border-border px-7 py-24 text-center">
        <p className="font-display text-[11px] tracking-[0.16em] text-primary uppercase">Get started</p>
        <h2 className="mt-3 text-balance font-display text-3xl tracking-tight uppercase">Stop eyeballing it.</h2>
        <p className="mx-auto mt-4 max-w-[40ch] text-muted-foreground">
          One photo, one reference object, one model you can actually trust the size of.
        </p>
        <div className="mt-8">
          <Button variant="warm" size="lg">
            Scan your first object
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-7">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-2.5 px-7 font-display text-[11px] text-muted-foreground">
          <span>Tulasi.ai — built solo by Hafreed</span>
          <span>Calibrated, not guessed.</span>
        </div>
      </footer>
    </>
  )
}
