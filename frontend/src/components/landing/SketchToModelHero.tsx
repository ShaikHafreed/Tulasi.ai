import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { motion, useScroll, useTransform, useSpring, type MotionValue } from 'framer-motion'
import * as THREE from 'three'
import { useHydrated, useReducedMotion } from './useHydrated'

/**
 * SketchToModelHero — ported from the warm Lovable redesign (2026-07-23,
 * "Rolled out warm retheme & detail").
 * The spine of the page. On scroll:
 *   0.00 → 0.35 : hand-drawn SVG sketch of a mug, faint scan line begins
 *   0.20 → 0.60 : wireframe emerges behind the scan line
 *   0.55 → 1.00 : solid rendered mug, rotation driven by scroll
 * A monospace calibration readout ticks up alongside it.
 *
 * Mug handle — see CLAUDE.md "known regression risks": this geometry has
 * broken (handle rendering through the cup interior) across multiple
 * Lovable regenerations. The fix lives entirely in the `Mug` component below
 * and is derived from named constants (CUP_RADIUS/HANDLE_REACH), not
 * eyeballed coordinates, with a dev-mode assertion that measures the real
 * mesh vertices on every mount and fails loudly if a future edit regresses
 * it. Any Lovable resync that touches this file must be diffed against this
 * fix before merging — do not blindly accept an incoming regeneration here.
 */
export function SketchToModelHero({ onRequestAccess }: { onRequestAccess: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hydrated = useHydrated()
  const reduced = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  // Smooth the progress a touch so scrubbing feels buttery
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 })

  // Layer opacities
  const sketchOpacity = useTransform(p, [0, 0.35, 0.5], [1, 1, 0])
  const wireframeOpacity = useTransform(p, [0.25, 0.45, 0.65, 0.75], [0, 1, 1, 0])
  const modelOpacity = useTransform(p, [0.55, 0.8], [0, 1])

  // Scan line position (0..1 across container)
  const scanY = useTransform(p, [0, 0.7], [0, 1])
  const scanOpacity = useTransform(p, [0, 0.05, 0.65, 0.75], [0, 1, 1, 0])
  // Hoisted out of the conditional JSX below so it isn't a conditional hook.
  const scanTop = useTransform(scanY, (v) => `${v * 100}%`)

  // Calibration numbers
  const width = useTransform(p, [0.1, 0.9], [0, 92])
  const height = useTransform(p, [0.15, 0.9], [0, 108])
  const depth = useTransform(p, [0.2, 0.9], [0, 92])

  // Rotation for 3D model — scroll drives spin
  const rotY = useTransform(p, [0.5, 1], [0, Math.PI * 1.6])

  // Text fade for hero copy — pin & fade as sequence advances
  const copyOpacity = useTransform(p, [0, 0.15, 0.35, 0.5], [1, 1, 0.5, 0])
  const copyY = useTransform(p, [0, 0.5], [0, -40])

  return (
    <section
      ref={containerRef}
      className="relative"
      style={{ height: reduced ? '100vh' : '320vh' }}
      aria-label="Tulasi hero: sketch resolves into a 3D model as you scroll"
    >
      {/* Sticky viewport */}
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* Corner registration marks */}
        <RegistrationMarks />

        {/* Faint warm technical grid, masked to a soft circle around the stage */}
        <div
          className="absolute inset-0 pointer-events-none opacity-50"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(43,36,29,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(43,36,29,0.05) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(circle at 50% 50%, black 40%, transparent 90%)',
            WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 40%, transparent 90%)',
          }}
        />

        {/* Object stage — centered */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative h-[62vh] w-[62vh] max-w-[560px] max-h-[560px]">
            {/* Sketch layer */}
            <motion.div style={{ opacity: reduced ? 1 : sketchOpacity }} className="absolute inset-0">
              <MugSketch />
            </motion.div>

            {/* 3D layers — mounted only after hydration */}
            {hydrated && !reduced && (
              <>
                <motion.div style={{ opacity: wireframeOpacity }} className="absolute inset-0">
                  <Canvas camera={{ position: [0, 0.4, 3.4], fov: 40 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
                    <ambientLight intensity={0.6} />
                    <Mug rotY={rotY} variant="wire" />
                  </Canvas>
                </motion.div>

                <motion.div style={{ opacity: modelOpacity }} className="absolute inset-0">
                  <Canvas camera={{ position: [0, 0.4, 3.4], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[3, 4, 2]} intensity={1.2} color="#faf6f0" />
                    <directionalLight position={[-3, -1, 1]} intensity={0.5} color="#c96f4a" />
                    <Mug rotY={rotY} variant="solid" />
                  </Canvas>
                </motion.div>
              </>
            )}

            {/* Reduced-motion / SSR fallback: static wireframe illustration */}
            {(!hydrated || reduced) && (
              <div className="absolute inset-0">
                <MugStaticWire />
              </div>
            )}

            {/* Scan line sweeping across the stage */}
            {!reduced && (
              <motion.div
                aria-hidden
                className="absolute left-0 right-0 h-px pointer-events-none"
                style={{
                  top: scanTop,
                  opacity: scanOpacity,
                  background: 'linear-gradient(to right, transparent, var(--color-teal), transparent)',
                  boxShadow: '0 0 24px 4px rgba(201,111,74,0.35), 0 0 60px 12px rgba(201,111,74,0.18)',
                }}
              />
            )}

            {/* Corner ticks around the stage */}
            <StageTicks />
          </div>
        </div>

        {/* Hero copy */}
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-24 md:top-28 flex flex-col items-center px-6 text-center"
          style={{ opacity: reduced ? 1 : copyOpacity, y: reduced ? 0 : copyY }}
        >
          <div className="font-mono text-[11px] tracking-[0.3em] text-teal uppercase">
            <span className="text-muted-foreground">// spec_</span>
            tulasi.ai / precision 3d
          </div>
          <h1 className="mt-5 font-display text-4xl md:text-6xl lg:text-7xl leading-[1.02] max-w-4xl">
            Meshy makes it <span className="italic text-muted-foreground">look</span> right.
            <br />
            Tulasi makes it <span className="text-teal-glow">FIT</span> right.
          </h1>
          <p className="mt-4 max-w-xl text-sm md:text-base text-muted-foreground">
            AI‑native 3D design measured to the millimeter. Sketch it, scan it, fit it — no post‑cleanup.
          </p>
          <div className="pointer-events-auto mt-8 flex items-center gap-3">
            <button
              type="button"
              onClick={onRequestAccess}
              className="group inline-flex items-center gap-2 rounded-none border border-teal bg-teal/10 px-5 py-3 font-mono text-xs uppercase tracking-[0.2em] text-teal transition-colors hover:bg-teal hover:text-navy"
            >
              Request access
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </button>
            <a
              href="#calibration"
              className="inline-flex items-center gap-2 px-3 py-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
            >
              See it measure ↓
            </a>
          </div>
        </motion.div>

        {/* Calibration readout */}
        <CalibrationReadout width={width} height={height} depth={depth} progress={p} />

        {/* Scroll hint */}
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
          scroll to resolve ↓
        </div>
      </div>
    </section>
  )
}

/* ---------- 3D mug (procedural, low-poly) ---------- */

// The cup body is a slightly tapered cylinder — CUP_RADIUS is its top (widest)
// radius, the boundary the handle must never render inside of.
const CUP_RADIUS = 0.7
const HANDLE_TORUS_RADIUS = 0.42
const HANDLE_TUBE_RADIUS = 0.09
// Design-intent margin: the handle's outermost point should clear the wall
// by at least this much, so it never reads as flush/clipped even at odd
// camera angles. Checked (not just documented) by the dev assertion below.
const HANDLE_REACH = CUP_RADIUS * 0.4

// The handle sits exactly at the cup's outer wall and its half-torus arc
// opens toward the body, so the loop bulges OUTWARD by construction — never
// eyeballed coordinates. Applies to both the wire and solid variants below
// since they share this one placement.
//
// The rotation SIGN matters and has flipped (wrong) across regenerations
// before: +Math.PI/2 spins the arc's bulge back toward the axis (clips
// through the cup interior); -Math.PI/2 is the one verified below to keep
// every vertex outside CUP_RADIUS. Do not "simplify" this sign without
// re-running that verification.
const HANDLE_POS: [number, number, number] = [CUP_RADIUS, 0, 0]
const HANDLE_ROT: [number, number, number] = [0, 0, -Math.PI / 2]

function Mug({ rotY, variant }: { rotY: MotionValue<number>; variant: 'wire' | 'solid' }) {
  const group = useRef<THREE.Group>(null)

  useFrame(() => {
    if (!group.current) return
    group.current.rotation.y = rotY.get()
  })

  const bodyGeom = useMemo(() => new THREE.CylinderGeometry(CUP_RADIUS, 0.62, 1.5, 40, 1, false), [])
  const handleGeom = useMemo(
    () => new THREE.TorusGeometry(HANDLE_TORUS_RADIUS, HANDLE_TUBE_RADIUS, 16, 40, Math.PI),
    [],
  )
  const insideGeom = useMemo(() => new THREE.CylinderGeometry(0.62, 0.55, 1.35, 40, 1, true), [])

  // Dev-only safeguard: measure the ACTUAL handle vertices (post transform),
  // not a hand-derived formula, so this catches a regression regardless of
  // how the geometry/position/rotation numbers above get edited later.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...HANDLE_POS),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...HANDLE_ROT)),
      new THREE.Vector3(1, 1, 1),
    )
    const v = new THREE.Vector3()
    const positions = handleGeom.attributes.position
    let minRadius = Infinity
    let maxRadius = 0
    for (let i = 0; i < positions.count; i++) {
      v.fromBufferAttribute(positions, i).applyMatrix4(matrix)
      const radius = Math.hypot(v.x, v.z) // distance from the mug's central (Y) axis
      minRadius = Math.min(minRadius, radius)
      maxRadius = Math.max(maxRadius, radius)
    }
    if (minRadius < CUP_RADIUS - 0.01) {
      console.error(
        `[mug handle regression] a handle vertex is ${minRadius.toFixed(3)} units from the central axis — ` +
          `inside the cup radius (${CUP_RADIUS}). The handle must never render through the cup interior. ` +
          `See CLAUDE.md "known regression risks" and frontend/src/components/landing/SketchToModelHero.tsx.`,
      )
    }
    if (maxRadius < CUP_RADIUS + HANDLE_REACH) {
      console.error(
        `[mug handle regression] the handle's outermost point (${maxRadius.toFixed(3)}) doesn't clear ` +
          `cupRadius + handleReach (${(CUP_RADIUS + HANDLE_REACH).toFixed(3)}) — it will read as flush/clipped.`,
      )
    }
  }, [handleGeom])

  if (variant === 'wire') {
    return (
      <group ref={group}>
        <mesh geometry={bodyGeom}>
          <meshBasicMaterial color="#c96f4a" wireframe transparent opacity={0.85} />
        </mesh>
        <mesh geometry={handleGeom} position={HANDLE_POS} rotation={HANDLE_ROT}>
          <meshBasicMaterial color="#c96f4a" wireframe transparent opacity={0.85} />
        </mesh>
      </group>
    )
  }

  return (
    <group ref={group}>
      <mesh geometry={bodyGeom} castShadow>
        <meshStandardMaterial color="#efe3d2" roughness={0.45} metalness={0.02} />
      </mesh>
      <mesh geometry={insideGeom} position={[0, 0.08, 0]}>
        <meshStandardMaterial color="#3a2e24" roughness={0.7} side={THREE.BackSide} />
      </mesh>
      <mesh geometry={handleGeom} position={HANDLE_POS} rotation={HANDLE_ROT}>
        <meshStandardMaterial color="#efe3d2" roughness={0.45} metalness={0.02} />
      </mesh>
    </group>
  )
}

/* ---------- Sketch layer (hand-drawn feel) ---------- */

// NOTE: these two SVGs are hand-authored paths, not derived from
// CUP_RADIUS/HANDLE_REACH above — they already draw the handle attached to
// the outer wall and bulging outward (see the "handle" comment in each). If
// the 3D constants above ever change enough to visibly shift the handle's
// proportions, re-check these by eye; they won't update automatically.
function MugSketch() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full">
      <defs>
        <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="1.4" />
        </filter>
      </defs>
      <g className="sketch-stroke" filter="url(#rough)">
        {/* mug body */}
        <path d="M 130 130 L 128 300 Q 128 320 148 322 L 252 322 Q 272 320 272 300 L 270 130 Z" />
        {/* ellipse top rim */}
        <ellipse cx="200" cy="130" rx="70" ry="16" />
        <ellipse cx="200" cy="130" rx="62" ry="12" opacity="0.55" />
        {/* handle — attached to the outer wall, bulging outward */}
        <path d="M 272 165 Q 320 175 320 220 Q 320 265 272 275" />
        <path d="M 272 180 Q 305 188 305 220 Q 305 252 272 260" opacity="0.55" />
        {/* base shadow line */}
        <path d="M 148 322 Q 200 332 252 322" opacity="0.55" />
        {/* construction lines */}
        <line x1="200" y1="80" x2="200" y2="340" strokeDasharray="3 5" opacity="0.35" />
        <line x1="90" y1="130" x2="330" y2="130" strokeDasharray="3 5" opacity="0.35" />
        <line x1="90" y1="322" x2="330" y2="322" strokeDasharray="3 5" opacity="0.35" />
      </g>
      {/* annotation */}
      <g className="font-mono" fill="var(--color-teal)" fontSize="9" fontFamily="var(--font-mono)">
        <text x="82" y="128">A</text>
        <text x="82" y="326">B</text>
        <text x="336" y="222">R.42</text>
      </g>
    </svg>
  )
}

function MugStaticWire() {
  // Simple SVG wireframe fallback (no r3f) so reduced motion still shows something
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full">
      <g stroke="var(--color-teal)" strokeWidth="1" fill="none" opacity="0.85">
        <ellipse cx="200" cy="130" rx="70" ry="16" />
        <ellipse cx="200" cy="322" rx="62" ry="14" />
        <line x1="130" y1="130" x2="138" y2="322" />
        <line x1="270" y1="130" x2="262" y2="322" />
        {Array.from({ length: 8 }).map((_, i) => {
          const t = i / 7
          const x1 = 130 + (270 - 130) * t
          const x2 = 138 + (262 - 138) * t
          return <line key={i} x1={x1} y1="130" x2={x2} y2="322" opacity="0.4" />
        })}
        {[160, 200, 240, 280].map((y) => (
          <ellipse key={y} cx="200" cy={y} rx={70 - (y - 130) * 0.06} ry={16 - (y - 130) * 0.01} opacity="0.35" />
        ))}
        {/* handle — attached to the outer wall, bulging outward */}
        <path d="M 270 165 Q 320 175 320 220 Q 320 265 270 275" />
      </g>
    </svg>
  )
}

/* ---------- HUD pieces ---------- */

function RegistrationMarks() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-6 md:inset-10">
      {(['tl', 'tr', 'bl', 'br'] as const).map((pos) => (
        <div
          key={pos}
          className="absolute w-4 h-4"
          style={{
            top: pos.startsWith('t') ? 0 : 'auto',
            bottom: pos.startsWith('b') ? 0 : 'auto',
            left: pos.endsWith('l') ? 0 : 'auto',
            right: pos.endsWith('r') ? 0 : 'auto',
            borderTop: pos.startsWith('t') ? '1px solid var(--color-teal)' : 'none',
            borderBottom: pos.startsWith('b') ? '1px solid var(--color-teal)' : 'none',
            borderLeft: pos.endsWith('l') ? '1px solid var(--color-teal)' : 'none',
            borderRight: pos.endsWith('r') ? '1px solid var(--color-teal)' : 'none',
            opacity: 0.7,
          }}
        />
      ))}
    </div>
  )
}

function StageTicks() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute left-0 right-0 bottom-[-24px] flex items-center gap-1 font-mono text-[9px] text-teal/70 uppercase tracking-[0.2em]">
        <span>x</span>
        <div className="h-px flex-1 bg-teal/40" />
        <span>+</span>
      </div>
      <div className="absolute top-0 bottom-0 left-[-24px] flex flex-col items-center gap-1 font-mono text-[9px] text-teal/70 uppercase tracking-[0.2em]">
        <span>y</span>
        <div className="w-px flex-1 bg-teal/40" />
        <span>+</span>
      </div>
    </div>
  )
}

function CalibrationReadout({
  width,
  height,
  depth,
  progress,
}: {
  width: MotionValue<number>
  height: MotionValue<number>
  depth: MotionValue<number>
  progress: MotionValue<number>
}) {
  return (
    <div className="pointer-events-none absolute bottom-16 md:bottom-20 left-1/2 -translate-x-1/2 w-[min(680px,92vw)]">
      <div className="corner-ticks border border-teal/30 bg-navy-deep/70 backdrop-blur px-5 py-3 font-mono text-[10px] md:text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-teal">
            <span className="inline-block h-1.5 w-1.5 bg-teal caret-blink" />
            calibrating
          </span>
          <ReadoutValue label="w" mv={width} unit="mm" />
          <ReadoutValue label="h" mv={height} unit="mm" />
          <ReadoutValue label="d" mv={depth} unit="mm" />
          <ProgressReadout mv={progress} />
        </div>
      </div>
    </div>
  )
}

function ReadoutValue({ label, mv, unit }: { label: string; mv: MotionValue<number>; unit: string }) {
  const display = useTransform(mv, (v) => v.toFixed(1).padStart(5, '0'))
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground/70">{label}</span>
      <motion.span className="text-foreground tabular-nums">{display}</motion.span>
      <span className="text-muted-foreground/60 text-[9px]">{unit}</span>
    </span>
  )
}

function ProgressReadout({ mv }: { mv: MotionValue<number> }) {
  const display = useTransform(mv, (v) => `${Math.round(v * 100).toString().padStart(3, '0')}%`)
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground/70">resolve</span>
      <motion.span className="text-teal tabular-nums">{display}</motion.span>
    </span>
  )
}
