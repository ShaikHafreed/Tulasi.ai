import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Stage, useGLTF } from '@react-three/drei'
import { Box, Layers, Maximize2, Minimize2 } from 'lucide-react'
import * as THREE from 'three'
import { cn } from '@/lib/utils'

export interface RotationTrigger {
  axis: 'x' | 'y'
  degrees: number
  nonce: number
}

export interface PanTrigger {
  direction: 'up' | 'down' | 'left' | 'right'
  magnitude: number
  nonce: number
}

// Gesture-driven pan now fires every processed frame (~18fps) for as long
// as a hand is held away from its resting anchor, not as an occasional
// one-shot event — this constant has to be small enough that continuous
// firing reads as a smooth pan, not a fling across the viewport.
const PAN_UNITS_PER_MAGNITUDE = 0.025

function Model({
  url,
  scale = 1,
  rotationTrigger,
  panTrigger,
  wireframe,
  onSnapshot,
}: {
  url: string
  scale?: number
  rotationTrigger?: RotationTrigger | null
  panTrigger?: PanTrigger | null
  wireframe: boolean
  onSnapshot?: (dataUrl: string) => void
}) {
  const { scene } = useGLTF(url)
  const invalidate = useThree((state) => state.invalidate)
  const gl = useThree((state) => state.gl)
  const baseScale = useRef(1)
  const appliedNonce = useRef<number | null>(null)
  const appliedPanNonce = useRef<number | null>(null)
  const snapshotTaken = useRef(false)

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    baseScale.current = 2 / maxDim
    scene.scale.setScalar(baseScale.current * scale)
    invalidate()

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
    scene.scale.setScalar(baseScale.current * scale)
    invalidate()
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
    const step = panTrigger.magnitude * PAN_UNITS_PER_MAGNITUDE
    if (panTrigger.direction === 'left') scene.position.x -= step
    else if (panTrigger.direction === 'right') scene.position.x += step
    else if (panTrigger.direction === 'up') scene.position.y += step
    else scene.position.y -= step
    invalidate()
  }, [panTrigger, scene, invalidate])

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
  const containerRef = useRef<HTMLDivElement>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full', presentationMode && 'bg-black')}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true }}
        camera={{ position: [0, 0, 3], fov: 45 }}
        className={cn(
          'w-full rounded-xl border border-border',
          presentationMode && 'rounded-none border-0',
        )}
        style={{ height: presentationMode ? '100vh' : '420px' }}
      >
        <Suspense fallback={null}>
          <Stage environment="city" intensity={0.5} adjustCamera={false}>
            <Model
              url={modelUrl}
              scale={scale}
              rotationTrigger={rotationTrigger}
              panTrigger={panTrigger}
              wireframe={wireframe}
              onSnapshot={onSnapshot}
            />
          </Stage>
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>

      {!presentationMode && (
        <div className="absolute top-3 right-3 flex overflow-hidden rounded-md border border-border bg-card/90 backdrop-blur">
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
