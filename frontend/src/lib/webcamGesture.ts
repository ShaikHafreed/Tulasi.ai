import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'

// Same 4 gestures Track 2 (the physical glove) will classify from flex/IMU
// data — keep this contract stable so gestureToCommand.ts can map both
// tracks through one shared function.
export type GestureType = 'rotate' | 'move' | 'resize_up' | 'resize_down'

export interface GestureEvent {
  gesture: GestureType
  magnitude: number // 0..1 intensity, always positive
  direction?: 'up' | 'down' | 'left' | 'right' // set for 'move'
  signedDelta?: number // set for 'rotate': +degrees clockwise, -degrees counter-clockwise
  timestamp: number
}

export interface TrackedPoint {
  x: number
  y: number
  z: number
}

// Live raw numbers behind the current classification, surfaced to the debug
// panel so thresholds below can be retuned by eye.
export interface GestureDebugInfo {
  pinch: number
  moveDist: number
  rotateDeltaDeg: number
}

// SINGLE HAND ONLY. We track exactly one hand (the most-confident one) and
// ignore any second hand entirely — matching the glove track, and avoiding
// the ambiguity/misfires of simultaneous two-hand control.
const MAX_HANDS = 1

// Throttle to ~18fps — within the spec's 15-20fps target, easy on CPU.
const FRAME_INTERVAL_MS = 1000 / 18

// Skip frames where hand tracking is low-confidence rather than classifying a
// guess — MediaPipe's handedness score is the available proxy for detection
// quality; below this the frame is treated as "no hand".
const MIN_HAND_CONFIDENCE = 0.5

// A classified gesture TYPE must persist this long before it starts firing —
// debounces the noisy transitions between poses, matching the glove firmware's
// 150ms hold. Once stable, a held pose fires every processed frame.
const DEBOUNCE_MS = 150

// All four gestures are HELD POSES relative to a neutral reference, judged
// every processed frame — not one-shot motions:
//  - Resize compares pinch distance to a fixed absolute open/closed threshold.
//  - Move/rotate compare against an ANCHOR captured the moment the hand first
//    becomes trackable (a joystick centered wherever the hand rested); holding
//    away from it keeps firing, returning near it stops. The anchor re-centers
//    whenever tracking is lost and regained.
//
// Thresholds tuned by eye against the debug overlay — retune after real usage.
const PINCH_OPEN_THRESHOLD = 0.09
const PINCH_CLOSED_THRESHOLD = 0.035
const RESIZE_BASE_MAGNITUDE = 0.05
const RESIZE_MAGNITUDE_GAIN = 3

const MOVE_DEAD_ZONE = 0.06
const MOVE_MAGNITUDE_GAIN = 4

const ROTATE_DEAD_ZONE_DEG = 10
const ROTATE_STEP_DEGREES_PER_FRAME = 4
const ROTATE_MAGNITUDE_GAIN = 1 / 30

// Self-hosted (public/mediapipe/) rather than pulled from external CDNs some
// networks block — that broke gesture control with an opaque "[object Event]"
// load failure before ever reaching our own code.
const HAND_LANDMARKER_WASM_BASE = '/mediapipe/wasm'
const HAND_LANDMARKER_MODEL_URL = '/mediapipe/hand_landmarker.task'

let sharedLandmarker: Promise<HandLandmarker> | null = null

// MediaPipe's loader can reject with a raw Event instead of an Error (→ the
// unhelpful "[object Event]"); normalize into a readable Error.
function toLoadError(err: unknown): Error {
  if (err instanceof Error) return err
  if (err instanceof Event) {
    const target = err.target as { src?: string; error?: unknown } | null
    return new Error(
      `Failed to load the hand-tracking model (${err.type}${target?.src ? ` from ${target.src}` : ''}) — check your internet connection.`,
    )
  }
  return new Error(typeof err === 'string' ? err : 'Failed to load the hand-tracking model.')
}

function loadHandLandmarker(): Promise<HandLandmarker> {
  if (!sharedLandmarker) {
    sharedLandmarker = FilesetResolver.forVisionTasks(HAND_LANDMARKER_WASM_BASE)
      .then((vision) =>
        HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: HAND_LANDMARKER_MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: MAX_HANDS,
        }),
      )
      .catch((err) => {
        // Don't cache a failed load, or "Try again" would re-reject instantly.
        sharedLandmarker = null
        throw toLoadError(err)
      })
  }
  return sharedLandmarker
}

function distance2d(a: TrackedPoint, b: TrackedPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export interface WebcamGestureHandlers {
  onFrame?: (landmarks: TrackedPoint[] | null) => void
  onDebug?: (info: GestureDebugInfo | null) => void
  onGesture: (event: GestureEvent) => void
}

// What a frame classifies to before debouncing — the type plus its already-
// computed parameters, or null when the hand is neutral / mid-transition.
type Classified = Omit<GestureEvent, 'timestamp'> | null

// Threshold-based state machine over per-frame landmarks — deliberately not an
// ML classifier, mirroring the firmware approach so both tracks stay easy to
// reason about and retune.
export class WebcamGestureTracker {
  private video: HTMLVideoElement
  private handlers: WebcamGestureHandlers
  private rafHandle: number | null = null
  private lastFrameTime = 0
  private stopped = true
  private generation = 0

  // Single-hand joystick center. Re-centers whenever the hand is lost.
  private anchorPalm: { x: number; y: number } | null = null
  private anchorAngleDeg: number | null = null

  // Debounce state for the classified gesture type.
  private candidateType: GestureType | null = null
  private candidateSince = 0
  private activeType: GestureType | null = null

  constructor(video: HTMLVideoElement, handlers: WebcamGestureHandlers) {
    this.video = video
    this.handlers = handlers
  }

  async start(): Promise<void> {
    const myGeneration = ++this.generation
    const landmarker = await loadHandLandmarker()
    if (myGeneration !== this.generation) return

    this.stopped = false
    const loop = (time: number) => {
      if (this.stopped) return
      if (time - this.lastFrameTime >= FRAME_INTERVAL_MS && this.video.readyState >= 2) {
        this.lastFrameTime = time
        this.processResult(landmarker.detectForVideo(this.video, time), time)
      }
      this.rafHandle = requestAnimationFrame(loop)
    }
    this.rafHandle = requestAnimationFrame(loop)
  }

  stop(): void {
    this.generation += 1
    this.stopped = true
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle)
    this.rafHandle = null
    this.resetTracking()
  }

  private resetTracking(): void {
    this.anchorPalm = null
    this.anchorAngleDeg = null
    this.candidateType = null
    this.activeType = null
  }

  private processResult(result: HandLandmarkerResult, time: number): void {
    const hand = result.landmarks?.[0]
    const confidence = result.handedness?.[0]?.[0]?.score ?? 0

    // No hand, too few landmarks, or low confidence → skip this frame and
    // re-center. The second hand (index ≥ 1) is never looked at.
    if (!hand || hand.length < 21 || confidence < MIN_HAND_CONFIDENCE) {
      this.handlers.onFrame?.(null)
      this.handlers.onDebug?.(null)
      this.resetTracking()
      return
    }

    this.handlers.onFrame?.(hand)

    const wrist = hand[0]
    const thumbTip = hand[4]
    const indexTip = hand[8]
    const indexMcp = hand[5]
    const middleMcp = hand[9]
    const ringMcp = hand[13]
    const pinkyMcp = hand[17]

    const pinch = distance2d(thumbTip, indexTip)
    const palm = {
      x: (wrist.x + indexMcp.x + middleMcp.x + ringMcp.x + pinkyMcp.x) / 5,
      y: (wrist.y + indexMcp.y + middleMcp.y + ringMcp.y + pinkyMcp.y) / 5,
    }
    const angleDeg = (Math.atan2(middleMcp.y - wrist.y, middleMcp.x - wrist.x) * 180) / Math.PI

    if (this.anchorPalm === null) this.anchorPalm = palm
    if (this.anchorAngleDeg === null) this.anchorAngleDeg = angleDeg

    const dx = palm.x - this.anchorPalm.x
    const dy = palm.y - this.anchorPalm.y
    const moveDist = Math.hypot(dx, dy)

    let rotateDeltaDeg = angleDeg - this.anchorAngleDeg
    if (rotateDeltaDeg > 180) rotateDeltaDeg -= 360
    if (rotateDeltaDeg < -180) rotateDeltaDeg += 360

    this.handlers.onDebug?.({ pinch, moveDist, rotateDeltaDeg })

    const classified = this.classify(pinch, dx, dy, moveDist, rotateDeltaDeg)
    this.emitDebounced(classified, time)
  }

  // Priority: resize (a deliberate pinch) > move (translation) > rotate (twist).
  private classify(pinch: number, dx: number, dy: number, moveDist: number, rotateDeltaDeg: number): Classified {
    if (pinch > PINCH_OPEN_THRESHOLD) {
      const magnitude = Math.min(RESIZE_BASE_MAGNITUDE + (pinch - PINCH_OPEN_THRESHOLD) * RESIZE_MAGNITUDE_GAIN, 1)
      return { gesture: 'resize_up', magnitude }
    }
    if (pinch < PINCH_CLOSED_THRESHOLD) {
      const magnitude = Math.min(RESIZE_BASE_MAGNITUDE + (PINCH_CLOSED_THRESHOLD - pinch) * RESIZE_MAGNITUDE_GAIN, 1)
      return { gesture: 'resize_down', magnitude }
    }
    if (moveDist > MOVE_DEAD_ZONE) {
      const direction: GestureEvent['direction'] =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
      const magnitude = Math.min((moveDist - MOVE_DEAD_ZONE) * MOVE_MAGNITUDE_GAIN, 1)
      return { gesture: 'move', magnitude, direction }
    }
    if (Math.abs(rotateDeltaDeg) > ROTATE_DEAD_ZONE_DEG) {
      const excess = Math.abs(rotateDeltaDeg) - ROTATE_DEAD_ZONE_DEG
      const magnitude = Math.min(excess * ROTATE_MAGNITUDE_GAIN, 1)
      const signedDelta = Math.sign(rotateDeltaDeg) * magnitude * ROTATE_STEP_DEGREES_PER_FRAME
      return { gesture: 'rotate', magnitude, signedDelta }
    }
    return null
  }

  // Only fire once a gesture type has been stable for DEBOUNCE_MS — so brief
  // flickers during hand transitions don't misfire; a held pose then fires
  // every frame.
  private emitDebounced(classified: Classified, time: number): void {
    const type = classified?.gesture ?? null

    if (type !== this.candidateType) {
      this.candidateType = type
      this.candidateSince = time
    }

    if (type === null) {
      this.activeType = null
      return
    }

    if (this.activeType !== type && time - this.candidateSince >= DEBOUNCE_MS) {
      this.activeType = type
    }

    if (this.activeType === type && classified) {
      this.handlers.onGesture({ ...classified, timestamp: time })
    }
  }
}
