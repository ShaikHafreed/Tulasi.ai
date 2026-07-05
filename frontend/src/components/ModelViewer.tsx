import {
  Suspense,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type RefObject,
} from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stage, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { GestureState } from '@/hooks/useHandGestures'

interface OrbitControlsLike {
  object: THREE.Camera
  target: THREE.Vector3
  update: () => void
}

export interface ModelViewerHandle {
  orbitBy: (yawDegrees: number, pitchDegrees: number) => void
}

// Bridges the assistant's rotate_view action into the R3F scene: it needs
// useThree's invalidate() (only available inside the Canvas) to wake the
// frameloop="demand" render loop after an imperative camera mutation.
function ImperativeBridge({
  apiRef,
  controlsRef,
}: {
  apiRef: RefObject<ModelViewerHandle | null>
  controlsRef: RefObject<OrbitControlsLike | null>
}) {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    apiRef.current = {
      orbitBy: (yawDegrees, pitchDegrees) => {
        const controls = controlsRef.current
        if (!controls) return
        const offset = controls.object.position.clone().sub(controls.target)
        const spherical = new THREE.Spherical().setFromVector3(offset)
        spherical.theta -= THREE.MathUtils.degToRad(yawDegrees)
        spherical.phi = THREE.MathUtils.clamp(
          spherical.phi - THREE.MathUtils.degToRad(pitchDegrees),
          0.05,
          Math.PI - 0.05,
        )
        offset.setFromSpherical(spherical)
        controls.object.position.copy(controls.target).add(offset)
        controls.update()
        invalidate()
      },
    }
  }, [apiRef, controlsRef, invalidate])

  return null
}

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

// Palm-drag orbits the camera, pinch distance zooms it, and a two-hand
// stretch scales the model. Additive on top of OrbitControls — mouse drag
// keeps working the same way whether or not gestures are active.
function GestureController({
  gestureRef,
  controlsRef,
  resizeGroupRef,
}: {
  gestureRef: RefObject<GestureState>
  controlsRef: RefObject<OrbitControlsLike | null>
  resizeGroupRef: RefObject<THREE.Group | null>
}) {
  const invalidate = useThree((state) => state.invalidate)

  useFrame(() => {
    const gesture = gestureRef.current
    const controls = controlsRef.current
    let changed = false

    if (controls && (gesture.orbitDelta.x !== 0 || gesture.orbitDelta.y !== 0)) {
      const offset = controls.object.position.clone().sub(controls.target)
      const spherical = new THREE.Spherical().setFromVector3(offset)
      spherical.theta -= gesture.orbitDelta.x
      spherical.phi = THREE.MathUtils.clamp(spherical.phi - gesture.orbitDelta.y, 0.05, Math.PI - 0.05)
      offset.setFromSpherical(spherical)
      controls.object.position.copy(controls.target).add(offset)
      gesture.orbitDelta = { x: 0, y: 0 }
      changed = true
    }

    if (controls && gesture.zoomDelta !== 0) {
      const factor = 1 + THREE.MathUtils.clamp(gesture.zoomDelta * 3, -0.2, 0.2)
      controls.object.position.sub(controls.target).multiplyScalar(factor).add(controls.target)
      gesture.zoomDelta = 0
      changed = true
    }

    if (resizeGroupRef.current && gesture.resizeScale) {
      const scale = THREE.MathUtils.clamp(gesture.resizeScale, 0.9, 1.1)
      resizeGroupRef.current.scale.multiplyScalar(scale)
      gesture.resizeScale = null
      changed = true
    }

    if (changed) {
      controls?.update()
    }

    // frameloop="demand" only re-renders on invalidate() — since gesture
    // deltas arrive from an independent requestAnimationFrame loop outside
    // React/R3F, this must invalidate unconditionally on every tick while
    // mounted, or the render loop stalls the first time a frame has no
    // gesture delta and never resumes on its own.
    invalidate()
  })

  return null
}

const ModelViewer = forwardRef<
  ModelViewerHandle,
  { modelUrl: string; gestureRef?: RefObject<GestureState> }
>(function ModelViewer({ modelUrl, gestureRef }, ref) {
  const controlsRef = useRef<OrbitControlsLike | null>(null)
  const resizeGroupRef = useRef<THREE.Group>(null)
  const apiRef = useRef<ModelViewerHandle | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      orbitBy: (yaw, pitch) => apiRef.current?.orbitBy(yaw, pitch),
    }),
    [],
  )

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [0, 0, 3], fov: 45 }}
      style={{ width: '100%', height: '500px' }}
    >
      <Suspense fallback={null}>
        <group ref={resizeGroupRef}>
          <Stage environment="city" intensity={0.5} adjustCamera={false}>
            <Model url={modelUrl} />
          </Stage>
        </group>
      </Suspense>
      <OrbitControls ref={controlsRef as never} makeDefault />
      <ImperativeBridge apiRef={apiRef} controlsRef={controlsRef} />
      {gestureRef && (
        <GestureController gestureRef={gestureRef} controlsRef={controlsRef} resizeGroupRef={resizeGroupRef} />
      )}
    </Canvas>
  )
})

export default ModelViewer
