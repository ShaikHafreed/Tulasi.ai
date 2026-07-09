import { useEffect, useRef, useState } from 'react'
import AuthCard from './AuthCard'

const READINGS = [
  'COFFEE MUG      84.2 × 92.0 × 84.2 mm',
  'PHONE BRACKET   32.0 × 14.5 × 6.0 mm',
  'DOOR HINGE      63.5 × 40.0 × 3.2 mm',
  'PIPE CLAMP      32.0 × 32.0 × 18.0 mm',
]

function Reveal({ children }: { children: React.ReactNode }) {
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
    <div ref={ref} data-reveal className={visible ? 'in' : ''}>
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
    <div className="readout" data-reveal>
      <div className="readout-head">
        <span>Calibration readout</span>
        <span className="live">Live</span>
      </div>
      <div className="readout-body">
        <span className="val">{text || ' '}</span>
        {done && <span className="caret" />}
      </div>
      <div className="dim-line">
        <span className="tick l" />
        <span className="fill" />
        <span className="tick r" />
      </div>
    </div>
  )
}

export default function LandingPage() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [authMode, setAuthMode] = useState<'sign_in' | 'sign_up' | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <>
      <nav className="wrap">
        <div className="brand">
          <span className="dot" />
          TULASI.AI
        </div>
        <div className="nav-actions">
          <button type="button" className="nav-link" onClick={() => setAuthMode('sign_in')}>
            Sign in
          </button>
          <button type="button" className="nav-link primary" onClick={() => setAuthMode('sign_up')}>
            Sign up
          </button>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Day mode' : 'Night mode'}
          </button>
        </div>
      </nav>

      {authMode && <AuthCard mode={authMode} onClose={() => setAuthMode(null)} />}

      <header className="hero wrap">
        <p className="eyebrow">Photo → real-world 3D</p>
        <h1>
          Meshy makes it look right.
          <br />
          Tulasi makes it <span className="fit">FIT</span> right.
        </h1>
        <p className="sub">
          Photograph any object next to a coin or card. Tulasi calibrates against it and hands back a 3D
          model sized to the millimeter — not a guess dressed up in a nice render.
        </p>
        <div className="cta-row">
          <button className="btn btn-primary" type="button">
            Scan your first object
          </button>
          <a className="btn btn-ghost" href="#compare">
            See how it's different
          </a>
        </div>

        <CalibrationReadout />
      </header>

      <section className="compare wrap" id="compare">
        <div className="section-head">
          <p className="eyebrow">The actual difference</p>
          <h2>
            Generation quality is commoditized.
            <br />
            Dimensional accuracy isn't.
          </h2>
        </div>
        <div className="compare-grid">
          <Reveal>
            <div className="compare-col no">
              <p className="compare-label">Meshy · Tripo · Rodin</p>
              <div className="compare-item">
                <span className="mark">×</span>
                <span>
                  <b>Arbitrary scale.</b> The mesh comes out at whatever size the model decided — no link
                  to the real object.
                </span>
              </div>
              <div className="compare-item">
                <span className="mark">×</span>
                <span>
                  <b>No reference check.</b> Nothing in the pipeline knows what "correct size" even
                  means.
                </span>
              </div>
              <div className="compare-item">
                <span className="mark">×</span>
                <span>
                  <b>Print at your own risk.</b> Wall thickness, overhangs, stability — untested until it
                  fails on the plate.
                </span>
              </div>
            </div>
          </Reveal>
          <div className="compare-rule" />
          <Reveal>
            <div className="compare-col yes">
              <p className="compare-label">Tulasi</p>
              <div className="compare-item">
                <span className="mark">✓</span>
                <span>
                  <b>Calibrated scale.</b> A coin or card in frame gives millimeters-per-pixel — every
                  dimension is real.
                </span>
              </div>
              <div className="compare-item">
                <span className="mark">✓</span>
                <span>
                  <b>Editable, locked proportions.</b> Resize to a target measurement without distorting
                  the object.
                </span>
              </div>
              <div className="compare-item">
                <span className="mark">✓</span>
                <span>
                  <b>Checked before you print.</b> Wall thickness, overhangs, and stability flagged up
                  front.
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="features wrap">
        <div className="section-head">
          <p className="eyebrow">How it works</p>
          <h2>Four things doing the real work</h2>
        </div>
        <div className="feature-grid">
          {[
            {
              num: '01',
              title: 'Reference-object calibration',
              body: 'A credit card or ₹10 coin in the photo gives Tulasi a known real-world length. Every other measurement is derived from it.',
            },
            {
              num: '02',
              title: 'Smart dimension lock',
              body: 'Change one dimension to hit a target size and the others scale with it — proportional, not distorted.',
            },
            {
              num: '03',
              title: 'Print-ready validation',
              body: 'Wall thickness, unsupported overhangs, and base stability, checked against real FDM printing tolerances before export.',
            },
            {
              num: '04',
              title: 'Context-aware assistant',
              body: '"Make this bracket fit a 32mm pipe" — say it, and watch the model resize in front of you.',
            },
          ].map((feature) => (
            <Reveal key={feature.num}>
              <div className="feature">
                <span className="num">{feature.num}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="closing wrap">
        <p className="eyebrow">Get started</p>
        <h2>Stop eyeballing it.</h2>
        <p>One photo, one reference object, one model you can actually trust the size of.</p>
        <div className="cta-row">
          <button className="btn btn-primary" type="button">
            Scan your first object
          </button>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span>Tulasi.ai — built solo by Hafreed</span>
          <span>Calibrated, not guessed.</span>
        </div>
      </footer>
    </>
  )
}
