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
  hand?: string // which hand produced it (handedness label) — for logging/UI only
  timestamp: number
}

export interface TrackedPoint {
  x: number
  y: number
  z: number
}

// Live raw numbers behind the current classification, surfaced to the
// debug panel so thresholds below can be retuned by eye instead of by
// guesswork — the same reason the firmware track's DEBUG_SERIAL mode
// prints raw sensor values. One per tracked hand.
export interface GestureDebugInfo {
  hand: string
  pinch: number
  moveDist: number
  rotateDeltaDeg: number
}

// Up to two hands tracked at once — each hand is classified independently
// against its own neutral anchor, so both can drive gestures simultaneously
// (e.g. left hand rotating while right hand resizes). See classifyHand.
const MAX_HANDS = 2

// Throttle to ~18fps — within the spec's 15-20fps target, easy on CPU.
const FRAME_INTERVAL_MS = 1000 / 18

// All four gestures are HELD POSES relative to a neutral reference, judged
// every processed frame — not one-shot motions. Earlier versions compared
// each frame only to the previous one, which meant holding a static pose
// (hand spread wide, hand pushed to one side, wrist tilted) produced zero
// further delta after the initial motion and the gesture simply stopped,
// even though the hand never returned to neutral. Now:
//  - Resize compares pinch distance to a fixed absolute open/closed
//    threshold — "spread wide" and "pinched tight" are universal enough
//    poses not to need a personal calibration.
//  - Move/rotate compare against an ANCHOR captured the moment a hand
//    first becomes trackable (like a joystick centered wherever your hand
//    naturally rested) — pushing away from that anchor and holding keeps
//    firing every frame, proportional to how far you're holding it,
//    returning near the anchor stops it. The anchor re-centers whenever
//    tracking is lost and regained (hand leaves frame, closes into a fist
//    out of view, etc.), so there's no dedicated "recenter" gesture to learn.
//
// Thresholds tuned by eye against the debug overlay — expect to retune
// these after real usage (see CLAUDE.md build order step 3).
const PINCH_OPEN_THRESHOLD = 0.09
const PINCH_CLOSED_THRESHOLD = 0.035
const RESIZE_BASE_MAGNITUDE = 0.05
const RESIZE_MAGNITUDE_GAIN = 3

const MOVE_DEAD_ZONE = 0.06
const MOVE_MAGNITUDE_GAIN = 4

const ROTATE_DEAD_ZONE_DEG = 10
const ROTATE_STEP_DEGREES_PER_FRAME = 4
const ROTATE_MAGNITUDE_GAIN = 1 / 30

// Self-hosted (public/mediapipe/, copied from node_modules at build time —
// see frontend/README) rather than pulled from cdn.jsdelivr.net /
// storage.googleapis.com at runtime. Those two external CDNs are blocked by
// some networks/firewalls, which broke gesture control with an opaque
// "[object Event]" load failure instead of ever reaching our own code.
const HAND_LANDMARKER_WASM_BASE = '/mediapipe/wasm'
const HAND_LANDMARKER_MODEL_URL = '/mediapipe/hand_landmarker.task'

let sharedLandmarker: Promise<HandLandmarker> | null = null

// MediaPipe's internal wasm/model loader can reject with a raw Event (e.g. a
// Worker or XHR error event) instead of an Error — that produces the
// unhelpful "[object Event]" if it reaches String(err) unchanged, so
// normalize whatever comes out of here into a real Error with a readable
// message.
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
        // Don't cache a failed load — otherwise every future "Try again"
        // click would instantly re-reject with the same stale failure
        // instead of actually retrying the network fetch.
        sharedLandmarker = null
        throw toLoadError(err)
      })
  }
  return sharedLandmarker
}

function distance2d(a: TrackedPoint, b: TrackedPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Per-hand joystick center — one of these per tracked hand, keyed by
// handedness so a hand keeps its own anchor across frames.
interface HandState {
  anchorPalm: { x: number; y: number } | null
  anchorAngleDeg: number | null
}

export interface WebcamGestureHandlers {
  onFrame?: (hands: TrackedPoint[][]) => void
  onDebug?: (infos: GestureDebugInfo[]) => void
  onGesture: (event: GestureEvent) => void
}

// Threshold-based state machine over per-frame landmarks — deliberately not
// an ML classifier, mirrors the firmware approach planned for the glove
// track so both tracks stay easy to reason about and retune.
export class WebcamGestureTracker {
  private video: HTMLVideoElement
  private handlers: WebcamGestureHandlers
  private rafHandle: number | null = null
  private lastFrameTime = 0
  private stopped = true
  // Bumped by stop() so a start() call that's mid-await (loading the model)
  // when stop() fires notices on resume and bails instead of starting a
  // loop nobody wants anymore — model loading can take seconds, easily
  // longer than a React StrictMode dev double-mount's cleanup/remount gap.
  private generation = 0

  // Anchors per hand, keyed by handedness label ("Left"/"Right", with an
  // index suffix in the rare case MediaPipe labels both hands the same). A
  // hand that disappears has its entry dropped so it re-centers on return.
  private handStates = new Map<string, HandState>()

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
    this.handStates.clear()
  }

  private processResult(result: HandLandmarkerResult, time: number): void {
    const hands = result.landmarks ?? []
    const framePoints: TrackedPoint[][] = []
    const debugInfos: GestureDebugInfo[] = []
    const presentKeys = new Set<string>()

    for (let i = 0; i < hands.length; i++) {
      const landmarks = hands[i]
      if (!landmarks || landmarks.length < 21) continue

      // Key by handedness so each hand keeps its own anchor frame-to-frame,
      // not by array index (MediaPipe may reorder hands between frames).
      // Disambiguate the rare duplicate-label case with the index.
      const label = result.handedness?.[i]?.[0]?.categoryName ?? `hand-${i}`
      const key = presentKeys.has(label) ? `${label}-${i}` : label
      presentKeys.add(key)

      framePoints.push(landmarks)
      debugInfos.push(this.classifyHand(landmarks, key, time))
    }

    // Drop anchors for hands no longer on screen — a hand that leaves and
    // returns re-centers to wherever it comes back, so there's no stale
    // anchor to chase.
    for (const key of [...this.handStates.keys()]) {
      if (!presentKeys.has(key)) this.handStates.delete(key)
    }

    this.handlers.onFrame?.(framePoints)
    this.handlers.onDebug?.(debugInfos)
  }

  // Classifies a single hand against its own anchor and emits at most one
  // gesture for it. Returns the raw numbers for the debug readout. Called
  // once per hand per frame, so two hands produce two independent gestures
  // in the same frame.
  private classifyHand(hand: TrackedPoint[], key: string, time: number): GestureDebugInfo {
    let state = this.handStates.get(key)
    if (!state) {
      state = { anchorPalm: null, anchorAngleDeg: null }
      this.handStates.set(key, state)
    }

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

    if (state.anchorPalm === null) state.anchorPalm = palm
    if (state.anchorAngleDeg === null) state.anchorAngleDeg = angleDeg

    const dx = palm.x - state.anchorPalm.x
    const dy = palm.y - state.anchorPalm.y
    const moveDist = Math.hypot(dx, dy)

    let rotateDeltaDeg = angleDeg - state.anchorAngleDeg
    if (rotateDeltaDeg > 180) rotateDeltaDeg -= 360
    if (rotateDeltaDeg < -180) rotateDeltaDeg += 360

    const info: GestureDebugInfo = { hand: key, pinch, moveDist, rotateDeltaDeg }

    // Resize wins over move/rotate — a pinch is the most deliberate pose
    // and shouldn't be muddied by incidental hand drift while pinching.
    if (pinch > PINCH_OPEN_THRESHOLD) {
      const magnitude = Math.min(RESIZE_BASE_MAGNITUDE + (pinch - PINCH_OPEN_THRESHOLD) * RESIZE_MAGNITUDE_GAIN, 1)
      this.handlers.onGesture({ gesture: 'resize_up', magnitude, hand: key, timestamp: time })
      return info
    }
    if (pinch < PINCH_CLOSED_THRESHOLD) {
      const magnitude = Math.min(RESIZE_BASE_MAGNITUDE + (PINCH_CLOSED_THRESHOLD - pinch) * RESIZE_MAGNITUDE_GAIN, 1)
      this.handlers.onGesture({ gesture: 'resize_down', magnitude, hand: key, timestamp: time })
      return info
    }

    if (moveDist > MOVE_DEAD_ZONE) {
      const direction: GestureEvent['direction'] =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
      const magnitude = Math.min((moveDist - MOVE_DEAD_ZONE) * MOVE_MAGNITUDE_GAIN, 1)
      this.handlers.onGesture({ gesture: 'move', magnitude, direction, hand: key, timestamp: time })
      return info
    }

    if (Math.abs(rotateDeltaDeg) > ROTATE_DEAD_ZONE_DEG) {
      const excess = Math.abs(rotateDeltaDeg) - ROTATE_DEAD_ZONE_DEG
      const magnitude = Math.min(excess * ROTATE_MAGNITUDE_GAIN, 1)
      const signedDelta = Math.sign(rotateDeltaDeg) * magnitude * ROTATE_STEP_DEGREES_PER_FRAME
      this.handlers.onGesture({ gesture: 'rotate', magnitude, signedDelta, hand: key, timestamp: time })
    }

    return info
  }
}
