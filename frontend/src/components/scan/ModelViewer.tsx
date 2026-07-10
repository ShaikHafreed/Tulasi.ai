import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Stage, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

function Model({ url, scale = 1 }: { url: string; scale?: number }) {
  const { scene } = useGLTF(url)
  const invalidate = useThree((state) => state.invalidate)
  const baseScale = useRef(1)

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
    return () => {
      useGLTF.clear(url)
    }
  }, [url])

  return <primitive object={scene} />
}

export default function ModelViewer({ modelUrl, scale }: { modelUrl: string; scale?: number }) {
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
          <Model url={modelUrl} scale={scale} />
        </Stage>
      </Suspense>
      <OrbitControls makeDefault />
    </Canvas>
  )
}
