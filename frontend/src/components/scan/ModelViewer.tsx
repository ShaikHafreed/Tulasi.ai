import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Stage, useGLTF } from '@react-three/drei'
import { Box, Layers } from 'lucide-react'
import * as THREE from 'three'
import { cn } from '@/lib/utils'

export interface RotationTrigger {
  axis: 'x' | 'y'
  degrees: number
  nonce: number
}

function Model({
  url,
  scale = 1,
  rotationTrigger,
  wireframe,
  onSnapshot,
}: {
  url: string
  scale?: number
  rotationTrigger?: RotationTrigger | null
  wireframe: boolean
  onSnapshot?: (dataUrl: string) => void
}) {
  const { scene } = useGLTF(url)
  const invalidate = useThree((state) => state.invalidate)
  const gl = useThree((state) => state.gl)
  const baseScale = useRef(1)
  const appliedNonce = useRef<number | null>(null)
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
  onSnapshot,
}: {
  modelUrl: string
  scale?: number
  rotationTrigger?: RotationTrigger | null
  onSnapshot?: (dataUrl: string) => void
}) {
  const [wireframe, setWireframe] = useState(false)

  return (
    <div className="relative w-full">
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true }}
        camera={{ position: [0, 0, 3], fov: 45 }}
        className="w-full rounded-xl border border-border"
        style={{ height: '420px' }}
      >
        <Suspense fallback={null}>
          <Stage environment="city" intensity={0.5} adjustCamera={false}>
            <Model
              url={modelUrl}
              scale={scale}
              rotationTrigger={rotationTrigger}
              wireframe={wireframe}
              onSnapshot={onSnapshot}
            />
          </Stage>
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>

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
      </div>
    </div>
  )
}
