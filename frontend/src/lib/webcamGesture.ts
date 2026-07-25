import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { HoldRepeat } from './holdRepeat'
import { LandmarkFilter } from './oneEuroFilter'

// ===========================================================================
// FINGER-STATE ENCODING: every frame reduces the 21 MediaPipe hand landmarks
// to a 5-bit "which fingers are extended" pattern (FingerState below), judged
// per-finger from PIP-joint geometry (angle at the joint + tip-vs-PIP
// distance from the wrist), not a naive y-coordinate comparison — that fails
// whenever the hand is rotated relative to the camera.
//
// GESTURE DEFINITIONS (single hand, held poses):
//   1 finger  (index only)     → Move: continuous 360° direction from the
//                                 smoothed index MCP→tip pointing vector.
//   2 fingers (index+middle)   → Resize: vertical position vs. an anchor
//                                 captured on pose entry — above = continuous
//                                 increase, below = continuous decrease.
//   5 fingers (open palm)+twist→ Rotate: continuous, from active gyro-style
//                                 wrist-angle rate vs. an anchor.
// Any other combination is unmapped/neutral (GestureState.Idle).
//
// Every raw landmark position is passed through a One-Euro low-pass filter
// (oneEuroFilter.ts) — with implausible per-frame jumps rejected outright —
// before any of the above geometry is computed, so finger-state, pointing
// angle, and tilt are all judged from filtered, outlier-free positions.
// ===========================================================================

// Same 4 gestures Track 2 (the physical glove) classifies from flex/IMU
// data — keep this contract stable so gestureToCommand.ts can map both
// tracks through one shared function. Naming kept from the earlier
// pinch/anchor design (resize_up/resize_down) even though the trigger is now
// finger-count based, since gestureToCommand.ts and the glove firmware's
// Gesture enum both already speak these names.
export type GestureType = 'rotate' | 'move' | 'resize_up' | 'resize_down'

// Explicit named state machine — mirrors GestureType plus the neutral case,
// so "what is the tracker currently doing" is always one concrete value
// instead of an implicit `string | null` key. A const object + union type
// rather than `enum` — this project's tsconfig runs with erasableSyntaxOnly,
// which real TS enums (they emit a runtime object) aren't compatible with.
export const GestureState = {
  Idle: 'idle',
  Move: 'move',
  ResizeUp: 'resize_up',
  ResizeDown: 'resize_down',
  Rotate: 'rotate',
} as const
export type GestureState = (typeof GestureState)[keyof typeof GestureState]

export interface GestureEvent {
  gesture: GestureType
  magnitude: number // 0..1 intensity, always positive
  // set for 'move': continuous 360° direction, standard math convention
  // (0=+X/right, 90=+Y/up) — image-space Y is already flipped by the time
  // this is set, so consumers (gestureToCommand.ts, ModelViewer) do pure
  // trig with no axis-flip knowledge of their own. Supersedes the old
  // 4-way up/down/left/right bucket.
  angleDeg?: number
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
  state: GestureState
  fingers: { thumb: boolean; index: boolean; middle: boolean; ring: boolean; pinky: boolean }
  fingerCount: number
  rotateDeltaDeg: number
  smoothedAngleDeg: number | null
  // Live feedback for GestureDirectionArrow — null unless the matching pose
  // is currently held (independent of debounce/deadzone, so the arrow can
  // show "getting close" before a command actually fires).
  moveAngleDeg: number | null
  resizeDirection: 'increase' | 'decrease' | null
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

// --- Per-finger extended/curled, with HYSTERESIS -----------------------
// A non-thumb finger is "extended" when its tip sits farther from the wrist
// than its own PIP joint does, by a hand-size-relative margin (hand size is
// itself measured as wrist→middle-MCP distance, so this works regardless of
// how close the hand is to the camera), AND the PIP joint angle (the angle
// at PIP between MCP→PIP and PIP→TIP) is close to straight — the angle check
// is what makes this robust to hand rotation, where a pure distance/
// y-coordinate check falls over. The thumb moves sideways rather than
// up/down, so it's judged by tip-to-index-MCP spread instead (no PIP-angle
// equivalent for the thumb's more complex joint).
//
// Hysteresis: entering "extended" requires clearing the ENTER margin/angle;
// leaving it requires dropping below the (looser) EXIT margin/angle. This
// stops a finger sitting right at the boundary from flickering — the exit
// threshold is deliberately easier to satisfy than "not-enter" would be, so
// there's a real dead band between the two, not just one shared cutoff.
const EXTENDED_MARGIN_RATIO_ENTER = 0.15
const EXTENDED_MARGIN_RATIO_EXIT = 0.08
// A perfectly straight finger only measures ~180° in the 2D-projected PIP
// angle when it's held flat and parallel to the camera. At any natural
// gesture angle (fingers tilted toward/away from the camera at all — the
// normal way people hold a hand up to a webcam), perspective foreshortening
// pushes the projected angle well below that even for a genuinely straight
// finger. 160°/145° was calibrated for the flat-on case and left every other
// finger reading as permanently curled in practice — loosened substantially;
// a real curl still bends the PIP much sharper than this (typically well
// under 100°), so this still separates curled from extended cleanly.
const PIP_STRAIGHT_ANGLE_ENTER_DEG = 120
const PIP_STRAIGHT_ANGLE_EXIT_DEG = 100
const THUMB_SPREAD_RATIO_ENTER = 0.55
const THUMB_SPREAD_RATIO_EXIT = 0.4

const ROTATE_DEAD_ZONE_DEG = 10
const ROTATE_STEP_DEGREES_PER_FRAME = 4
const ROTATE_MAGNITUDE_RATE = 1 / 30

// Move is continuous (like rotate) — no "how far" concept for a pointing
// angle, so it's a steady rate for as long as the 1-finger pose is held.
const MOVE_MAGNITUDE = 1

// Resize (2 fingers): vertical position relative to the anchor captured on
// pose entry. Hysteresis band, same idea as the finger-extended check above:
// must clear the ENTER deadzone to start increasing/decreasing, must retract
// inside the (smaller) EXIT deadzone to go back to neutral — stops a hand
// sitting right at the boundary from flickering resize_up/resize_down/none.
const RESIZE_DEADZONE_ENTER = 0.05
const RESIZE_DEADZONE_EXIT = 0.025
const RESIZE_STEP_MAGNITUDE = 0.4

// One-Euro filter tuning (see oneEuroFilter.ts) for raw landmark positions.
// minCutoff: lower = smoother when the hand is nearly still. beta: higher =
// less lag when moving fast (at the cost of more jitter passthrough then).
const ONE_EURO_MIN_CUTOFF = 1.0
const ONE_EURO_BETA = 0.3
const ONE_EURO_D_CUTOFF = 1.0
const LANDMARK_COUNT = 21
// Max plausible per-second movement for a single landmark in normalized
// (0..1) coordinates — a real hand can't teleport across the frame in one
// ~55ms tick. A raw sample beyond this is a tracking glitch, discarded
// outright rather than fed into the filter (a low-pass filter alone would
// just lag behind a spike, not reject it).
const MAX_LANDMARK_VELOCITY_PER_SEC = 6.0

// Logs state transitions and raw-vs-filtered metrics to the console —
// verbose, off by default. Flip on to visually tune thresholds against the
// live webcam feed without needing the on-screen debug readout.
const DEBUG_GESTURE_LOG = false

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

// Angle at `pip` between the MCP→PIP and PIP→TIP vectors, in degrees —
// 180° is perfectly straight, smaller means more curled. More robust than a
// tip-vs-PIP y-coordinate comparison because it doesn't assume the hand is
// upright relative to the camera.
function jointAngleDeg(mcp: TrackedPoint, pip: TrackedPoint, tip: TrackedPoint): number {
  const v1x = mcp.x - pip.x
  const v1y = mcp.y - pip.y
  const v2x = tip.x - pip.x
  const v2y = tip.y - pip.y
  const dot = v1x * v2x + v1y * v2y
  const mag = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1
  const cos = Math.max(-1, Math.min(1, dot / mag))
  return (Math.acos(cos) * 180) / Math.PI
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

const STATE_BY_GESTURE: Record<GestureType, GestureState> = {
  move: GestureState.Move,
  resize_up: GestureState.ResizeUp,
  resize_down: GestureState.ResizeDown,
  rotate: GestureState.Rotate,
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

  // Low-pass-filters every raw landmark (with outlier rejection) before any
  // gesture geometry is computed from it.
  private landmarkFilter = new LandmarkFilter(LANDMARK_COUNT, MAX_LANDMARK_VELOCITY_PER_SEC, {
    minCutoff: ONE_EURO_MIN_CUTOFF,
    beta: ONE_EURO_BETA,
    dCutoff: ONE_EURO_D_CUTOFF,
  })

  // Per-finger hysteresis memory — each finger's PREVIOUS extended state,
  // consulted so entering/leaving "extended" use different thresholds.
  private fingerWasExtended: FingerState = { thumb: false, index: false, middle: false, ring: false, pinky: false }

  // Rotate's wrist-angle joystick center. Re-centers whenever the hand is lost.
  private anchorAngleDeg: number | null = null

  // Resize's vertical joystick anchor — captured fresh each time the
  // 2-finger pose is entered (cleared whenever it isn't held), per Part 4.
  private resizeAnchorY: number | null = null
  // Resize's hysteresis memory — the direction currently "latched", if any.
  private resizeLatched: 'increase' | 'decrease' | null = null

  // Debounce state for the classified gesture TYPE. Move's angle is
  // deliberately excluded from the key (it's continuous, changes every
  // frame — including it would defeat debouncing); resize_up vs resize_down
  // are already distinct GestureTypes so switching between them still
  // re-debounces correctly.
  private candidateKey: string | null = null
  private candidateSince = 0
  private activeKey: string | null = null
  private loggedState: GestureState | null = null

  // Condition-based continuous firing for resize (see holdRepeat.ts) — a
  // steady rate with no initial-delay gap, since Part 4 asks for the resize
  // to feel like a smooth continuous change, not an arrow-key-style repeat.
  private holdRepeat = new HoldRepeat({ immediateRepeat: true })

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
    this.landmarkFilter.reset()
    this.fingerWasExtended = { thumb: false, index: false, middle: false, ring: false, pinky: false }
    this.anchorAngleDeg = null
    this.resizeAnchorY = null
    this.resizeLatched = null
    this.candidateKey = null
    this.activeKey = null
    this.holdRepeat.stop()
  }

  private processResult(result: HandLandmarkerResult, time: number): void {
    const rawHand = result.landmarks?.[0]
    const confidence = result.handedness?.[0]?.[0]?.score ?? 0

    // No hand, too few landmarks, or low confidence → skip this frame and
    // re-center. The second hand (index ≥ 1) is never looked at.
    if (!rawHand || rawHand.length < 21 || confidence < MIN_HAND_CONFIDENCE) {
      this.handlers.onFrame?.(null)
      this.handlers.onDebug?.(null)
      this.resetTracking()
      return
    }

    // Every raw landmark goes through the One-Euro filter (with outlier
    // rejection against MAX_LANDMARK_VELOCITY_PER_SEC) before anything below
    // touches it — this is the actual fix for frame-to-frame jitter, not a
    // patch applied after the fact to one derived value.
    const hand = this.landmarkFilter.filter(rawHand, time / 1000)

    this.handlers.onFrame?.(hand)

    const wrist = hand[0]
    const thumbTip = hand[4]
    const indexMcp = hand[5]
    const indexPip = hand[6]
    const indexTip = hand[8]
    const middleMcp = hand[9]
    const middlePip = hand[10]
    const middleTip = hand[12]
    const ringMcp = hand[13]
    const ringPip = hand[14]
    const ringTip = hand[16]
    const pinkyMcp = hand[17]
    const pinkyPip = hand[18]
    const pinkyTip = hand[20]

    // Hand-size reference so the extended/curled thresholds scale with how
    // close the hand is to the camera, not just raw pixel/normalized distance.
    const handSpan = distance2d(wrist, middleMcp) || 1

    // Hysteresis-aware per-finger extended check: which threshold applies
    // depends on whether the finger was ALREADY extended last frame.
    const extendedWithHysteresis = (mcp: TrackedPoint, pip: TrackedPoint, tip: TrackedPoint, wasExtended: boolean): boolean => {
      const marginRatio = wasExtended ? EXTENDED_MARGIN_RATIO_EXIT : EXTENDED_MARGIN_RATIO_ENTER
      const angleThreshold = wasExtended ? PIP_STRAIGHT_ANGLE_EXIT_DEG : PIP_STRAIGHT_ANGLE_ENTER_DEG
      const distanceOk = distance2d(tip, wrist) > distance2d(pip, wrist) + marginRatio * handSpan
      const angleOk = jointAngleDeg(mcp, pip, tip) > angleThreshold
      return distanceOk && angleOk
    }
    const thumbSpread = distance2d(thumbTip, indexMcp)
    const thumbExtendedNow =
      thumbSpread > (this.fingerWasExtended.thumb ? THUMB_SPREAD_RATIO_EXIT : THUMB_SPREAD_RATIO_ENTER) * handSpan

    const fingers: FingerState = {
      thumb: thumbExtendedNow,
      index: extendedWithHysteresis(indexMcp, indexPip, indexTip, this.fingerWasExtended.index),
      middle: extendedWithHysteresis(middleMcp, middlePip, middleTip, this.fingerWasExtended.middle),
      ring: extendedWithHysteresis(ringMcp, ringPip, ringTip, this.fingerWasExtended.ring),
      pinky: extendedWithHysteresis(pinkyMcp, pinkyPip, pinkyTip, this.fingerWasExtended.pinky),
    }
    this.fingerWasExtended = fingers

    const angleDeg = (Math.atan2(middleMcp.y - wrist.y, middleMcp.x - wrist.x) * 180) / Math.PI
    if (this.anchorAngleDeg === null) this.anchorAngleDeg = angleDeg
    let rotateDeltaDeg = angleDeg - this.anchorAngleDeg
    if (rotateDeltaDeg > 180) rotateDeltaDeg -= 360
    if (rotateDeltaDeg < -180) rotateDeltaDeg += 360

    // Index-finger pointing vector, computed directly from the ALREADY
    // One-Euro-filtered landmarks — no second smoothing pass on top. A
    // fixed-rate EMA layered on top of the (already adaptively-smoothed)
    // filtered positions was cascading two low-pass filters, which compounds
    // lag; the visible symptom was move direction feeling "stuck" rather
    // than tracking the finger live. The One-Euro filter alone already does
    // the adaptive heavy-smoothing-when-still / light-when-moving-fast job
    // this was meant for. dy is negated on the way in — image space has Y
    // increasing downward, but this value is used everywhere downstream
    // (debug, the feedback arrow, the actual panView command) in standard
    // math convention (Y up) — flipping once here means nothing later has
    // to know about image-space quirks.
    const dx = indexTip.x - indexMcp.x
    const dy = -(indexTip.y - indexMcp.y)
    const smoothedAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI

    // Resize's vertical anchor — captured the first frame the 2-finger pose
    // is seen, cleared the instant it isn't (so re-entering always recenters
    // on wherever the finger currently is, per Part 4).
    const inResizePose = fingers.index && fingers.middle && !fingers.ring && !fingers.pinky
    if (inResizePose) {
      if (this.resizeAnchorY === null) this.resizeAnchorY = indexTip.y
    } else {
      this.resizeAnchorY = null
      this.resizeLatched = null
    }
    // Positive = finger has moved up (toward the top of frame) from the
    // anchor, in image space smaller y = higher up, hence the flip here too.
    const resizeDeltaY = this.resizeAnchorY === null ? 0 : this.resizeAnchorY - indexTip.y

    // Hysteresis on the resize deadzone: which threshold applies depends on
    // whether a direction is already latched.
    const resizeDeadzone = this.resizeLatched === null ? RESIZE_DEADZONE_ENTER : RESIZE_DEADZONE_EXIT
    if (Math.abs(resizeDeltaY) < resizeDeadzone) {
      this.resizeLatched = null
    } else {
      this.resizeLatched = resizeDeltaY > 0 ? 'increase' : 'decrease'
    }

    const isMovePose = fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky
    const debugInfo: GestureDebugInfo = {
      state: GestureState.Idle, // filled in below once classify() runs
      fingers,
      fingerCount: countExtended(fingers),
      rotateDeltaDeg,
      smoothedAngleDeg,
      moveAngleDeg: isMovePose ? smoothedAngleDeg : null,
      resizeDirection: inResizePose ? this.resizeLatched : null,
    }

    const classified = this.classify(fingers, rotateDeltaDeg, smoothedAngleDeg, this.resizeLatched)
    debugInfo.state = classified ? STATE_BY_GESTURE[classified.gesture] : GestureState.Idle
    this.handlers.onDebug?.(debugInfo)

    if (DEBUG_GESTURE_LOG && debugInfo.state !== this.loggedState) {
      this.loggedState = debugInfo.state
      // eslint-disable-next-line no-console
      console.debug('[gesture] state ->', debugInfo.state, {
        fingers,
        rawIndexTip: rawHand[8],
        filteredIndexTip: indexTip,
        smoothedAngleDeg,
        resizeDeltaY,
      })
    }

    this.emitDebounced(classified, time)
  }

  // Exact-match on which fingers are extended — not just a count — so an
  // unmapped combination (3 or 4 fingers) never accidentally reads as
  // "close enough" to a real pose.
  private classify(
    fingers: FingerState,
    rotateDeltaDeg: number,
    moveAngleDeg: number,
    resizeLatched: 'increase' | 'decrease' | null,
  ): Classified {
    const { thumb, index, middle, ring, pinky } = fingers

    if (index && !middle && !ring && !pinky) {
      return { gesture: 'move', magnitude: MOVE_MAGNITUDE, angleDeg: moveAngleDeg }
    }
    if (index && middle && !ring && !pinky) {
      if (resizeLatched === null) return null
      return { gesture: resizeLatched === 'increase' ? 'resize_up' : 'resize_down', magnitude: RESIZE_STEP_MAGNITUDE }
    }
    if (thumb && index && middle && ring && pinky && Math.abs(rotateDeltaDeg) > ROTATE_DEAD_ZONE_DEG) {
      const excess = Math.abs(rotateDeltaDeg) - ROTATE_DEAD_ZONE_DEG
      const magnitude = Math.min(excess * ROTATE_MAGNITUDE_RATE, 1)
      const signedDelta = Math.sign(rotateDeltaDeg) * magnitude * ROTATE_STEP_DEGREES_PER_FRAME
      return { gesture: 'rotate', magnitude, signedDelta }
    }
    return null
  }

  // Debounces the classified gesture type — a candidate must be stable for
  // DEBOUNCE_MS before it's accepted. angleDeg is deliberately excluded from
  // the key (continuous, changes every frame). Once accepted: rotate and
  // move both fire every processed frame (continuous — move has no more
  // discrete direction buckets to hold-repeat between); resize_up/down fire
  // via HoldRepeat's condition-based mode (steady rate, no initial-delay gap
  // — see holdRepeat.ts).
  private emitDebounced(classified: Classified, time: number): void {
    const key = classified?.gesture ?? null

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

    if (classified.gesture === 'rotate' || classified.gesture === 'move') {
      this.holdRepeat.update(null, () => {}) // continuous gestures never use hold-repeat
      this.handlers.onGesture({ ...classified, timestamp: time })
      return
    }

    this.holdRepeat.update(key, () => {
      this.handlers.onGesture({ ...classified, timestamp: performance.now() })
    })
  }
}
