import { Suspense, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Stage, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    scene.scale.setScalar(2 / maxDim)
    invalidate()
  }, [scene, invalidate])

  useEffect(() => {
    return () => {
      useGLTF.clear(url)
    }
  }, [url])

  return <primitive object={scene} />
}

export default function ModelViewer({ modelUrl }: { modelUrl: string }) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [0, 0, 3], fov: 45 }}
      style={{ width: '100%', height: '500px' }}
    >
      <Suspense fallback={null}>
        <Stage environment="city" intensity={0.5} adjustCamera={false}>
          <Model url={modelUrl} />
        </Stage>
      </Suspense>
      <OrbitControls makeDefault />
    </Canvas>
  )
}
