import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Stage, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

export interface RotationTrigger {
  axis: 'x' | 'y'
  degrees: number
  nonce: number
}

function Model({
  url,
  scale = 1,
  rotationTrigger,
}: {
  url: string
  scale?: number
  rotationTrigger?: RotationTrigger | null
}) {
  const { scene } = useGLTF(url)
  const invalidate = useThree((state) => state.invalidate)
  const baseScale = useRef(1)
  const appliedNonce = useRef<number | null>(null)

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    baseScale.current = 2 / maxDim
    scene.scale.setScalar(baseScale.current * scale)
    invalidate()
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
}: {
  modelUrl: string
  scale?: number
  rotationTrigger?: RotationTrigger | null
}) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [0, 0, 3], fov: 45 }}
      className="w-full rounded-xl border border-border"
      style={{ height: '420px' }}
    >
      <Suspense fallback={null}>
        <Stage environment="city" intensity={0.5} adjustCamera={false}>
          <Model url={modelUrl} scale={scale} rotationTrigger={rotationTrigger} />
        </Stage>
      </Suspense>
      <OrbitControls makeDefault />
    </Canvas>
  )
}
