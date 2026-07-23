import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { HoldRepeat } from './holdRepeat'

// Same 4 gestures Track 2 (the physical glove) classifies from flex/IMU
// data — keep this contract stable so gestureToCommand.ts can map both
// tracks through one shared function. Naming kept from the earlier
// pinch/anchor design (resize_up/resize_down) even though the trigger is now
// finger-count based, since gestureToCommand.ts and the glove firmware's
// Gesture enum both already speak these names.
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
  fingers: { thumb: boolean; index: boolean; middle: boolean; ring: boolean; pinky: boolean }
  fingerCount: number
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
// debounces the noisy transitions between finger poses (1↔2 and 2↔3 fingers
// are the most flicker-prone), matching the glove firmware's 150ms hold.
const DEBOUNCE_MS = 150

// FINGER-COUNT SCHEME — supersedes the old pinch/palm-anchor design:
//   0 fingers (fist)                          → neutral, no action
//   1 finger  (index only)                    → Move, direction = where the finger points
//   2 fingers (index + middle)                → Increase — instant step, then hold-repeat
//   3 fingers (index + middle + ring)          → Decrease — instant step, then hold-repeat
//   5 fingers (open palm) + wrist twist        → Rotate — unchanged continuous behavior
// Any other combination (e.g. 4 fingers) is deliberately unmapped and treated
// as neutral rather than guessing.
//
// A non-thumb finger is "extended" when its tip sits farther from the wrist
// than its own PIP joint does, by a hand-size-relative margin (hand size is
// itself measured as wrist→middle-MCP distance, so this works regardless of
// how close the hand is to the camera). The thumb moves sideways rather than
// up/down, so it's judged by tip-to-index-MCP spread instead.
const EXTENDED_MARGIN_RATIO = 0.15
const THUMB_SPREAD_RATIO = 0.55

const ROTATE_DEAD_ZONE_DEG = 10
const ROTATE_STEP_DEGREES_PER_FRAME = 4
const ROTATE_MAGNITUDE_RATE = 1 / 30

// Hold-repeat step sizes for move/increase/decrease — see holdRepeat.ts. The
// first step is a full, deliberate jump; repeat ticks (while still held past
// HOLD_REPEAT_DELAY_MS) are smaller, reading as a slow continuous change.
const INITIAL_STEP_MAGNITUDE = 1
const REPEAT_STEP_MAGNITUDE = 0.35

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

interface FingerState {
  thumb: boolean
  index: boolean
  middle: boolean
  ring: boolean
  pinky: boolean
}

function countExtended(fingers: FingerState): number {
  return Number(fingers.thumb) + Number(fingers.index) + Number(fingers.middle) + Number(fingers.ring) + Number(fingers.pinky)
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

  // Rotate's wrist-angle joystick center. Re-centers whenever the hand is lost.
  private anchorAngleDeg: number | null = null

  // Debounce state for the classified gesture type (+ direction, so a move
  // that changes direction re-debounces rather than instantly snapping).
  private candidateKey: string | null = null
  private candidateSince = 0
  private activeKey: string | null = null

  // Discrete instant-then-repeat firing for move/increase/decrease.
  private holdRepeat = new HoldRepeat()

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
    this.anchorAngleDeg = null
    this.candidateKey = null
    this.activeKey = null
    this.holdRepeat.stop()
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
    const indexMcp = hand[5]
    const indexPip = hand[6]
    const indexTip = hand[8]
    const middleMcp = hand[9]
    const middlePip = hand[10]
    const middleTip = hand[12]
    const ringPip = hand[14]
    const ringTip = hand[16]
    const pinkyPip = hand[18]
    const pinkyTip = hand[20]

    // Hand-size reference so the extended/curled thresholds scale with how
    // close the hand is to the camera, not just raw pixel/normalized distance.
    const handSpan = distance2d(wrist, middleMcp) || 1

    const extended = (tip: TrackedPoint, pip: TrackedPoint) =>
      distance2d(tip, wrist) > distance2d(pip, wrist) + EXTENDED_MARGIN_RATIO * handSpan

    const fingers: FingerState = {
      thumb: distance2d(thumbTip, indexMcp) > THUMB_SPREAD_RATIO * handSpan,
      index: extended(indexTip, indexPip),
      middle: extended(middleTip, middlePip),
      ring: extended(ringTip, ringPip),
      pinky: extended(pinkyTip, pinkyPip),
    }

    const angleDeg = (Math.atan2(middleMcp.y - wrist.y, middleMcp.x - wrist.x) * 180) / Math.PI
    if (this.anchorAngleDeg === null) this.anchorAngleDeg = angleDeg
    let rotateDeltaDeg = angleDeg - this.anchorAngleDeg
    if (rotateDeltaDeg > 180) rotateDeltaDeg -= 360
    if (rotateDeltaDeg < -180) rotateDeltaDeg += 360

    this.handlers.onDebug?.({ fingers, fingerCount: countExtended(fingers), rotateDeltaDeg })

    const classified = this.classify(fingers, indexMcp, indexTip, rotateDeltaDeg)
    this.emitDebounced(classified, time)
  }

  // Exact-match on which fingers are extended — not just a count — so 4
  // fingers (an unmapped, transition-prone combination) never accidentally
  // reads as "close enough" to 3 or 5.
  private classify(
    fingers: FingerState,
    indexMcp: TrackedPoint,
    indexTip: TrackedPoint,
    rotateDeltaDeg: number,
  ): Classified {
    const { thumb, index, middle, ring, pinky } = fingers

    if (index && !middle && !ring && !pinky) {
      const dx = indexTip.x - indexMcp.x
      const dy = indexTip.y - indexMcp.y
      const direction: GestureEvent['direction'] =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
      return { gesture: 'move', magnitude: INITIAL_STEP_MAGNITUDE, direction }
    }
    if (index && middle && !ring && !pinky) {
      return { gesture: 'resize_up', magnitude: INITIAL_STEP_MAGNITUDE }
    }
    if (index && middle && ring && !pinky) {
      return { gesture: 'resize_down', magnitude: INITIAL_STEP_MAGNITUDE }
    }
    if (thumb && index && middle && ring && pinky && Math.abs(rotateDeltaDeg) > ROTATE_DEAD_ZONE_DEG) {
      const excess = Math.abs(rotateDeltaDeg) - ROTATE_DEAD_ZONE_DEG
      const magnitude = Math.min(excess * ROTATE_MAGNITUDE_RATE, 1)
      const signedDelta = Math.sign(rotateDeltaDeg) * magnitude * ROTATE_STEP_DEGREES_PER_FRAME
      return { gesture: 'rotate', magnitude, signedDelta }
    }
    return null
  }

  // Debounces the classified gesture (+ direction/key) the same way the old
  // tracker debounced type alone — a candidate must be stable for
  // DEBOUNCE_MS before it's accepted. Once accepted, rotate fires every
  // processed frame (continuous, unchanged); move/increase/decrease instead
  // hand off to HoldRepeat for the instant-then-repeat cadence.
  private emitDebounced(classified: Classified, time: number): void {
    const key = classified ? `${classified.gesture}:${classified.direction ?? ''}` : null

    if (key !== this.candidateKey) {
      this.candidateKey = key
      this.candidateSince = time
    }

    if (key === null) {
      this.activeKey = null
      this.holdRepeat.update(null, () => {})
      return
    }

    if (this.activeKey !== key && time - this.candidateSince >= DEBOUNCE_MS) {
      this.activeKey = key
    }

    if (this.activeKey !== key || !classified) return

    if (classified.gesture === 'rotate') {
      this.holdRepeat.update(null, () => {}) // rotate never uses hold-repeat
      this.handlers.onGesture({ ...classified, timestamp: time })
      return
    }

    this.holdRepeat.update(key, (_k, isFirst) => {
      this.handlers.onGesture({
        ...classified,
        magnitude: isFirst ? INITIAL_STEP_MAGNITUDE : REPEAT_STEP_MAGNITUDE,
        timestamp: performance.now(),
      })
    })
  }
}
