import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'

// Pinned to the installed @mediapipe/tasks-vision version so the JS API and
// the wasm binary it loads stay in lockstep.
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_ASSET_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'

// Palm = landmark 0 (wrist). Pinch = distance between landmark 4 (thumb tip)
// and landmark 8 (index fingertip). See .claude/skills/threejs-viewer for
// how these deltas get applied to the viewer.
const WRIST = 0
const THUMB_TIP = 4
const INDEX_TIP = 8

export interface GestureState {
  orbitDelta: { x: number; y: number }
  zoomDelta: number
  resizeScale: number | null
}

function idleGesture(): GestureState {
  return { orbitDelta: { x: 0, y: 0 }, zoomDelta: 0, resizeScale: null }
}

function distance2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Palm movement drives orbit, pinch distance drives zoom, and the distance
 * between two hands drives resize. Gestures are optional and additive —
 * mouse/OrbitControls remain the primary input at all times.
 */
export function useHandGestures(enabled: boolean) {
  const gestureRef = useRef<GestureState>(idleGesture())
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setReady(false)
      setError(null)
      return
    }

    let cancelled = false
    let rafId: number | null = null
    let stream: MediaStream | null = null
    let landmarker: HandLandmarker | null = null
    let video: HTMLVideoElement | null = null
    let lastVideoTime = -1

    let prevPalm: { x: number; y: number } | null = null
    let prevPinchDistance: number | null = null
    let prevHandSpan: number | null = null

    function applyResult(result: HandLandmarkerResult) {
      const hands = result.landmarks
      if (!hands || hands.length === 0) {
        prevPalm = null
        prevPinchDistance = null
        prevHandSpan = null
        return
      }

      if (hands.length >= 2) {
        const span = distance2D(hands[0][WRIST], hands[1][WRIST])
        gestureRef.current.resizeScale = prevHandSpan ? span / prevHandSpan : null
        prevHandSpan = span
        prevPalm = null
        prevPinchDistance = null
        return
      }
      prevHandSpan = null

      const hand = hands[0]
      const wrist = hand[WRIST]
      const pinchDistance = distance2D(hand[THUMB_TIP], hand[INDEX_TIP])

      gestureRef.current.zoomDelta = prevPinchDistance !== null ? prevPinchDistance - pinchDistance : 0
      prevPinchDistance = pinchDistance

      gestureRef.current.orbitDelta = prevPalm
        ? { x: (wrist.x - prevPalm.x) * 4, y: (wrist.y - prevPalm.y) * 4 }
        : { x: 0, y: 0 }
      prevPalm = { x: wrist.x, y: wrist.y }
    }

    function loop() {
      if (!video || !landmarker) return
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime
        applyResult(landmarker.detectForVideo(video, performance.now()))
      }
      rafId = requestAnimationFrame(loop)
    }

    async function start() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE)
        const created = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_ASSET_PATH, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
        if (cancelled) {
          created.close()
          return
        }
        landmarker = created

        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        video = document.createElement('video')
        video.muted = true
        video.playsInline = true
        video.srcObject = stream
        await video.play()

        setReady(true)
        loop()
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not start hand tracking.')
        }
      }
    }

    start()

    return () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      stream?.getTracks().forEach((track) => track.stop())
      landmarker?.close()
      gestureRef.current = idleGesture()
      setReady(false)
    }
  }, [enabled])

  return { gestureRef, ready, error }
}
