import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls, Stage, useGLTF } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Box, Keyboard, Layers, Maximize2, Minimize2 } from 'lucide-react'
import * as THREE from 'three'
import { cn } from '@/lib/utils'
import { registerCommandHandlers } from '@/lib/tulasiCommands'

// Margin beyond the model's bounding sphere so it doesn't touch the frame
// edges when the camera auto-fits on load.
const CAMERA_FIT_MARGIN = 1.25

export interface RotationTrigger {
  axis: 'x' | 'y'
  degrees: number
  nonce: number
}

export interface PanTrigger {
  // Continuous 360° angle (standard math convention, degrees) — supersedes
  // the old 4-way direction bucket.
  angleDeg: number
  magnitude: number
  nonce: number
}

// Gesture-driven pan now fires every processed frame (~18fps) for as long
// as a hand is held away from its resting anchor, not as an occasional
// one-shot event — this constant has to be small enough that continuous
// firing reads as a smooth pan, not a fling across the viewport.
const PAN_UNITS_PER_MAGNITUDE = 0.025

// How much of the camera's actual visible frustum panning is allowed to use
// before the model would start crossing the frame edge — a hair under 1 so
// there's a visible margin, not a hard stop flush against the border. Real
// footage showed a single held Move gesture pushing the model past the top
// of the canvas within about a second (continuous per-frame firing with no
// bound), where it then stayed clipped for the rest of the session with no
// way back — this is what actually made "move in all directions" look
// broken, not the direction math itself (atan2 already covers the full
// circle). Clamping keeps every direction usable indefinitely instead of
// each one being a one-shot trip toward getting stuck off-screen.
const PAN_SAFETY_FACTOR = 0.85

// Camera intro orbit — 1.5s 360° Y-axis sweep when the model first loads.
// Uses useFrame so it ticks at the same rate as the render loop.
const INTRO_DURATION_MS = 1500

export type CameraPreset = 'front' | 'top' | 'side' | 'iso'

// CameraIntro: a render-only component that lives inside the Canvas and
// performs the orbital sweep then self-terminates. Mounted by ModelViewer
// when a new model URL arrives; unmounted once done.
function CameraIntro({ onDone }: { onDone: () => void }) {
  const { camera, invalidate } = useThree()
  const startTime = useRef<number | null>(null)
  // Radius/angle are captured on the FIRST tick, not at mount — under
  // frameloop="demand" this component's first real frame only runs once
  // Model's own fit effect has already set the real fitted camera position
  // and called invalidate(); capturing at mount would instead grab the
  // Canvas's hardcoded pre-fit position={[0,0,3]}.
  const radius = useRef<number | null>(null)
  const startAngle = useRef(0)
  const done = useRef(false)

  useFrame((_, delta) => {
    if (done.current) return
    if (startTime.current === null) {
      startTime.current = 0
      radius.current = camera.position.length()
      startAngle.current = Math.atan2(camera.position.x, camera.position.z)
    }
    startTime.current += delta * 1000 // delta is in seconds
    const t = Math.min(startTime.current / INTRO_DURATION_MS, 1)
    // ease-in-out cubic
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    const angle = startAngle.current + eased * Math.PI * 2
    const r = radius.current ?? camera.position.length()
    const y = camera.position.y
    camera.position.set(r * Math.sin(angle), y, r * Math.cos(angle))
    camera.lookAt(0, 0, 0)
    // frameloop="demand" only renders a frame when invalidated — without
    // this call the sweep would draw its first frame, then freeze there.
    invalidate()
    if (t >= 1) {
      done.current = true
      onDone()
    }
  })

  return null
}

// Always-mounted, invisible — exposes R3F's invalidate() to code running
// outside the Canvas (snapToPreset's plain requestAnimationFrame loop),
// which frameloop="demand" would otherwise never redraw for.
function InvalidateBridge({ invalidateRef }: { invalidateRef: { current: (() => void) | null } }) {
  const invalidate = useThree((state) => state.invalidate)
  invalidateRef.current = invalidate
  return null
}

function Model({
  url,
  scale = 1,
  rotationTrigger,
  panTrigger,
  wireframe,
  onSnapshot,
  onReady,
}: {
  url: string
  scale?: number
  rotationTrigger?: RotationTrigger | null
  panTrigger?: PanTrigger | null
  wireframe: boolean
  onSnapshot?: (dataUrl: string) => void
  onReady?: () => void
}) {
  const { scene } = useGLTF(url)
  const invalidate = useThree((state) => state.invalidate)
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const viewportSize = useThree((state) => state.size)
  const baseScale = useRef(1)
  const appliedNonce = useRef<number | null>(null)
  const appliedPanNonce = useRef<number | null>(null)
  const snapshotTaken = useRef(false)
  const cameraFitted = useRef(false)
  // Raw (unscaled) bounding-sphere radius and the fitted camera's visible
  // half-width/half-height at the model's z=0 plane — captured once at fit
  // time so the pan clamp can be recomputed against the model's CURRENT
  // scale (gesture resize) without re-fitting the camera itself.
  const boundingRadiusRaw = useRef(1)
  const visibleHalfWidth = useRef(Infinity)
  const visibleHalfHeight = useRef(Infinity)
  // The mesh's own bounding-box center, in its raw (unscaled) local space —
  // Meshy's output isn't guaranteed to be centered on its own local origin.
  // panOffset is the accumulated gesture-pan translation in world units,
  // tracked separately so a scale change (resize) never has to guess at or
  // wipe out whatever pan the user already applied.
  const centerLocal = useRef(new THREE.Vector3())
  const panOffset = useRef(new THREE.Vector3())

  // Single place that derives scene.position from the two independent
  // things that affect it: the centering correction (scale-dependent, so it
  // must be recomputed on every resize) and the accumulated pan (scale-
  // independent, world units). Previously scale changes and pan both wrote
  // scene.position directly with no centering term at all — the viewer only
  // "looked" centered when a given Meshy mesh's own local origin happened
  // to already sit at its bounding-box center, which isn't guaranteed.
  function applyTransform() {
    const s = baseScale.current * scale
    scene.scale.setScalar(s)
    scene.position.set(
      panOffset.current.x - centerLocal.current.x * s,
      panOffset.current.y - centerLocal.current.y * s,
      panOffset.current.z - centerLocal.current.z * s,
    )
  }

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    baseScale.current = 2 / maxDim
    box.getCenter(centerLocal.current)
    panOffset.current.set(0, 0, 0)
    applyTransform()

    // Fit the camera to the real post-scale bounding sphere once, on the
    // model's first load — not on every scale change, or a gesture-driven
    // resize would keep yanking the camera back to a fixed distance and
    // fight whatever angle/zoom the user (or OrbitControls) already set.
    // This was the actual cause of the model rendering tiny in a mostly-
    // empty canvas: adjustCamera={false} on <Stage> below (deliberately, so
    // resize/pan gestures don't fight Stage's own auto-fit) meant nothing
    // ever framed the camera correctly on load either — the fixed
    // position=[0,0,3] doesn't reliably frame every object's real
    // proportions once its own bounding sphere is accounted for.
    if (!cameraFitted.current && camera instanceof THREE.PerspectiveCamera) {
      cameraFitted.current = true
      const sphere = box.getBoundingSphere(new THREE.Sphere())
      const radius = sphere.radius * baseScale.current || 1
      const vFov = (camera.fov * Math.PI) / 180
      const aspect = viewportSize.width / viewportSize.height
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
      const distance = Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2)) * CAMERA_FIT_MARGIN
      camera.position.set(0, 0, distance)
      camera.near = Math.max(distance / 100, 0.01)
      camera.far = distance * 100
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()

      boundingRadiusRaw.current = sphere.radius || 1
      visibleHalfHeight.current = distance * Math.tan(vFov / 2)
      visibleHalfWidth.current = distance * Math.tan(hFov / 2)
    }
    invalidate()
    // Fires as soon as the model's scale/position/camera-fit is actually
    // applied — independent of the (best-effort, can fail on a tainted
    // canvas) snapshot capture below, so a snapshot failure never leaves
    // the model permanently hidden behind a "loading" state.
    onReady?.()

    if (onSnapshot && !snapshotTaken.current) {
      snapshotTaken.current = true
      // frameloop="demand" only renders on the next queued frame after
      // invalidate() — wait two rAFs so the canvas actually has pixels
      // before reading them back.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            onSnapshot(gl.domElement.toDataURL('image/jpeg', 0.85))
          } catch {
            // Canvas may be tainted (cross-origin texture) — skip silently,
            // the library falls back to showing no thumbnail.
          }
        })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, invalidate])

  useEffect(() => {
    applyTransform()
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, scene, invalidate])

  useEffect(() => {
    if (!rotationTrigger || rotationTrigger.nonce === appliedNonce.current) return
    appliedNonce.current = rotationTrigger.nonce
    const radians = (rotationTrigger.degrees * Math.PI) / 180
    if (rotationTrigger.axis === 'x') {
      scene.rotation.x += radians
    } else {
      scene.rotation.y += radians
    }
    invalidate()
  }, [rotationTrigger, scene, invalidate])

  useEffect(() => {
    if (!panTrigger || panTrigger.nonce === appliedPanNonce.current) return
    appliedPanNonce.current = panTrigger.nonce
    // angleDeg is standard math convention (0=+X/right, 90=+Y/up) by the time
    // it reaches here — webcamGesture.ts/firmware already convert from their
    // own image/sensor space, so this is pure trig, no axis-flip knowledge.
    const step = panTrigger.magnitude * PAN_UNITS_PER_MAGNITUDE
    const rad = (panTrigger.angleDeg * Math.PI) / 180

    // Clamped to the camera's actual visible frustum, recomputed against the
    // model's CURRENT scale (a gesture resize can grow/shrink it after the
    // camera was fitted) — every direction stays usable instead of one push
    // being enough to drift the model past the frame edge with no way back.
    const effectiveRadius = boundingRadiusRaw.current * baseScale.current * scale
    const boundX = Math.max((visibleHalfWidth.current - effectiveRadius) * PAN_SAFETY_FACTOR, 0)
    const boundY = Math.max((visibleHalfHeight.current - effectiveRadius) * PAN_SAFETY_FACTOR, 0)

    panOffset.current.x = THREE.MathUtils.clamp(panOffset.current.x + Math.cos(rad) * step, -boundX, boundX)
    panOffset.current.y = THREE.MathUtils.clamp(panOffset.current.y + Math.sin(rad) * step, -boundY, boundY)
    applyTransform()
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panTrigger, scene, invalidate, scale])

  useEffect(() => {
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        if ('wireframe' in material) material.wireframe = wireframe
      }
    })
    invalidate()
  }, [wireframe, scene, invalidate])

  useEffect(() => {
    cameraFitted.current = false
    return () => {
      useGLTF.clear(url)
    }
  }, [url])

  return <primitive object={scene} />
}

export default function ModelViewer({
  modelUrl,
  scale,
  rotationTrigger,
  panTrigger,
  onSnapshot,
}: {
  modelUrl: string
  scale?: number
  rotationTrigger?: RotationTrigger | null
  panTrigger?: PanTrigger | null
  onSnapshot?: (dataUrl: string) => void
}) {
  const [wireframe, setWireframe] = useState(false)
  const [presentationMode, setPresentationMode] = useState(false)
  const [controlsIdle, setControlsIdle] = useState(false)
  // Whether the camera intro orbit is still in progress
  const [introRunning, setIntroRunning] = useState(true)
  // Reset intro whenever the model URL changes (new scan)
  const prevUrl = useRef(modelUrl)
  const [modelLoaded, setModelLoaded] = useState(false)
  const [showKeyHelp, setShowKeyHelp] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const orbitRef = useRef<OrbitControlsImpl>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // R3F's invalidate() is only reachable via useThree(), inside the Canvas —
  // snapToPreset's lerp loop runs as a plain rAF outside React Three Fiber
  // entirely, so it needs this bridge to keep frameloop="demand" rendering
  // each tick instead of drawing one frame and freezing.
  const invalidateRef = useRef<(() => void) | null>(null)

  // Reset intro on model URL change
  useEffect(() => {
    if (prevUrl.current !== modelUrl) {
      prevUrl.current = modelUrl
      setIntroRunning(true)
      setModelLoaded(false)
    }
  }, [modelUrl])

  useEffect(() => {
    function handleFullscreenChange() {
      setPresentationMode(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    if (!presentationMode) {
      setControlsIdle(false)
      return
    }
    function resetIdle() {
      setControlsIdle(false)
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => setControlsIdle(true), 3000)
    }
    resetIdle()
    window.addEventListener('pointermove', resetIdle)
    return () => {
      window.removeEventListener('pointermove', resetIdle)
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [presentationMode])

  // Keyboard controls — only active when the canvas container is focused and
  // no text input is focused (so typing in DimensionPanel isn't intercepted).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const controls = orbitRef.current
      if (!controls) return
      switch (event.key) {
        case 'f':
        case 'F':
          event.preventDefault()
          setWireframe((w) => !w)
          break
        case 'r':
        case 'R':
          event.preventDefault()
          controls.reset()
          break
        case '?':
          setShowKeyHelp((v) => !v)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Smooth camera preset snapping via lerp in a useFrame-equivalent
  // implemented outside the Canvas using a rAF loop — avoids having to
  // add yet another inner Canvas component just for lerp state.
  function snapToPreset(preset: CameraPreset) {
    const controls = orbitRef.current
    if (!controls) return
    const d = (controls.object as THREE.PerspectiveCamera).position.length()
    const targets: Record<CameraPreset, THREE.Vector3> = {
      front: new THREE.Vector3(0, 0, d),
      top:   new THREE.Vector3(0, d, 0.001),
      side:  new THREE.Vector3(d, 0, 0),
      iso:   new THREE.Vector3(d * 0.7, d * 0.7, d * 0.7),
    }
    const target = targets[preset]
    const cam = controls.object as THREE.Camera
    const startPos = cam.position.clone()
    const startTime = performance.now()
    const duration = 500 // ms
    // Capture non-null controls before the async tick closure
    const ctrl = controls

    function tick() {
      const t = Math.min((performance.now() - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      cam.position.lerpVectors(startPos, target, eased)
      cam.lookAt(0, 0, 0)
      ctrl.update()
      invalidateRef.current?.()
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  async function enterPresentation() {
    try {
      await containerRef.current?.requestFullscreen()
    } catch {
      // Fullscreen may be blocked by browser/OS policy — fail silently,
      // the toggle button simply stays put and nothing changes.
    }
  }

  function exitPresentation() {
    if (document.fullscreenElement) void document.exitFullscreen()
  }

  // Expose presentation toggle through the shared command whitelist so the
  // command palette (and the assistant) can trigger it — using live DOM
  // fullscreen state, not React state, so the [] closure never goes stale.
  // Removed on unmount rather than clearing all handlers (that's ScanView's
  // job for its own set).
  useEffect(() => {
    registerCommandHandlers({
      togglePresentation: () => {
        if (document.fullscreenElement === containerRef.current) exitPresentation()
        else void enterPresentation()
      },
      // Camera preset commands exposed to the AI copilot
      cameraFront: () => snapToPreset('front'),
      cameraTop:   () => snapToPreset('top'),
      cameraSide:  () => snapToPreset('side'),
      cameraIso:   () => snapToPreset('iso'),
    })
    return () => registerCommandHandlers({
      togglePresentation: undefined,
      cameraFront: undefined,
      cameraTop: undefined,
      cameraSide: undefined,
      cameraIso: undefined,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const PRESETS: { key: CameraPreset; label: string }[] = [
    { key: 'front', label: 'Front' },
    { key: 'top',   label: 'Top'   },
    { key: 'side',  label: 'Side'  },
    { key: 'iso',   label: 'Iso'   },
  ]

  const KEY_SHORTCUTS = [
    { key: 'F', description: 'Toggle wireframe' },
    { key: 'R', description: 'Reset camera' },
    { key: '?', description: 'Toggle this help' },
  ]

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full', presentationMode && 'bg-black')}
    >
      {/* Loading skeleton — shown until the model renders for the first time */}
      {!modelLoaded && (
        <div
          className="skel flex w-full items-center justify-center rounded-xl border border-border"
          style={{ height: '420px' }}
          aria-label="3D model loading"
          aria-busy="true"
        >
          <Box size={32} className="animate-spin text-muted-foreground/40" style={{ animationDuration: '3s' }} />
        </div>
      )}

      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true }}
        camera={{ position: [0, 0, 3], fov: 45 }}
        className={cn(
          'w-full rounded-xl border border-border',
          presentationMode && 'rounded-none border-0',
          // Hide canvas until model is loaded (skeleton shows instead)
          !modelLoaded && 'invisible absolute inset-0',
        )}
        style={{ height: presentationMode ? '100vh' : '420px' }}
        onCreated={() => setModelLoaded(false)}
      >
        <Suspense fallback={null}>
          {/* "studio" instead of the old "city" HDRI — a neutral, non-
              photographic environment reads like a CAD/3D-software viewport
              (what was actually being asked for) instead of an outdoor photo
              reflecting off the model. shadows="contact" is the soft
              grounding shadow under the object; the Grid below is the
              floor-plane reference Blender's viewport always shows. */}
          <Stage environment="studio" intensity={0.55} shadows="contact" adjustCamera={false}>
            <Model
              url={modelUrl}
              scale={scale}
              rotationTrigger={rotationTrigger}
              panTrigger={panTrigger}
              wireframe={wireframe}
              onSnapshot={onSnapshot}
              onReady={() => setModelLoaded(true)}
            />
          </Stage>
          {/* Camera intro orbit — mounted when a new model loads, self-unmounts on completion */}
          {introRunning && (
            <CameraIntro onDone={() => setIntroRunning(false)} />
          )}
          <InvalidateBridge invalidateRef={invalidateRef} />
        </Suspense>
        {/* Blender-style floor grid reference — fades with distance so it
            reads as a subtle spatial cue, not a dominant pattern, given the
            model itself usually only spans a couple of the grid's units. */}
        <Grid
          position={[0, -1, 0]}
          args={[10.5, 10.5]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#2b241d"
          sectionSize={2.5}
          sectionThickness={1}
          sectionColor="#c96f4a"
          fadeDistance={12}
          fadeStrength={1.5}
          infiniteGrid
        />
        <OrbitControls ref={orbitRef} makeDefault />
      </Canvas>

      {!presentationMode && (
        <div className="absolute top-3 right-3 flex flex-col gap-1.5">
          {/* View mode toggles */}
          <div className="flex overflow-hidden rounded-md border border-border bg-card/90 backdrop-blur">
            <button
              type="button"
              onClick={() => setWireframe(false)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors',
                !wireframe && 'bg-primary/15 text-primary',
              )}
              aria-pressed={!wireframe}
            >
              <Box size={13} /> Solid
            </button>
            <button
              type="button"
              onClick={() => setWireframe(true)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors',
                wireframe && 'bg-primary/15 text-primary',
              )}
              aria-pressed={wireframe}
            >
              <Layers size={13} /> Mesh
            </button>
            <button
              type="button"
              onClick={enterPresentation}
              className="flex items-center gap-1.5 border-l border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              <Maximize2 size={13} /> Present
            </button>
          </div>

          {/* Camera view presets */}
          <div className="flex overflow-hidden rounded-md border border-border bg-card/90 backdrop-blur">
            {PRESETS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => snapToPreset(key)}
                className="flex-1 border-r border-border px-2 py-1.5 text-[10px] text-muted-foreground transition-colors last:border-r-0 hover:bg-primary/10 hover:text-primary font-mono tracking-[0.1em]"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard shortcut help popover */}
      {showKeyHelp && !presentationMode && (
        <div className="liquid-glass absolute bottom-3 left-3 rounded-lg px-3 py-2.5 text-[11px]">
          <p className="mb-1.5 font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase">Keyboard shortcuts</p>
          {KEY_SHORTCUTS.map(({ key, description }) => (
            <div key={key} className="flex items-center gap-2.5 py-0.5">
              <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">{key}</kbd>
              <span className="text-muted-foreground">{description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Keyboard help toggle button */}
      {!presentationMode && (
        <button
          type="button"
          onClick={() => setShowKeyHelp((v) => !v)}
          className={cn(
            'absolute bottom-3 right-3 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-card/90 text-[10px] text-muted-foreground backdrop-blur transition-colors hover:text-primary',
            showKeyHelp && 'bg-primary/15 text-primary',
          )}
          aria-label="Keyboard shortcuts"
          aria-expanded={showKeyHelp}
        >
          <Keyboard size={12} />
        </button>
      )}

      {presentationMode && (
        <button
          type="button"
          onClick={exitPresentation}
          className={cn(
            'absolute top-3 right-3 flex items-center gap-1.5 rounded-md border border-white/20 bg-black/60 px-2.5 py-1.5 text-xs text-white/80 backdrop-blur transition-opacity duration-500',
            controlsIdle ? 'opacity-0' : 'opacity-100',
          )}
        >
          <Minimize2 size={13} /> Exit
        </button>
      )}
    </div>
  )
}
