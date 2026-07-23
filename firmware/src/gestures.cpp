#include "gestures.h"

#include <math.h>

// ===========================================================================
// Gesture-classification thresholds. These are the numbers you retune against
// the DEBUG_SERIAL stream — deliberately named constants, no magic numbers
// inline. Starting values are provisional (see firmware/README "Tuning"); the
// flex numbers in particular depend on your specific voltage dividers and
// finger travel, so expect to adjust them on the first hardware pass.
//
// FINGER-COUNT SCHEME — mirrors the webcam track (frontend/src/lib/
// webcamGesture.ts), supersedes the old whole-hand fist/splay resize +
// tilt-anywhere move design:
//   index only               -> Move (direction from the existing tilt logic)
//   index + middle            -> ResizeUp ("increase") — hold-repeat
//   index + middle + ring     -> ResizeDown ("decrease") — hold-repeat
//   all five extended + twist -> Rotate — unchanged continuous behavior
// Any other combination (e.g. four fingers) is deliberately unmapped.
//
// Move/ResizeUp/ResizeDown fire as discrete hold-repeat steps (one immediate
// step, then a slower repeat while held) instead of firing every frame —
// see holdRepeatGate() below, the C++ equivalent of holdRepeat.ts.
// ===========================================================================

// --- Per-finger curl detection ----------------------------------------------
// SensorFrame::flex[] is baseline-subtracted, ordered thumb->pinky (matches
// FLEX_PINS in config.h): positive = curled toward the palm, ~0 = relaxed/
// straight. A finger counts as "extended" when it's NOT curled past this.
static const float FLEX_CURL_THRESHOLD = 250.0f;

enum FingerIndex { kThumb = 0, kIndex = 1, kMiddle = 2, kRing = 3, kPinky = 4 };

// --- Rotate (gyro twist): an ACTIVE wrist twist about the pointing axis ----
// Using the gyro rate (not static roll) keeps rotate separable from a held
// tilt used for Move — twisting produces rate, holding a tilt does not.
static const int GYRO_TWIST_AXIS = 0;  // 0=x (roll/twist), 1=y, 2=z
static const float ROTATE_RATE_DEADZONE = 25.0f;   // deg/s below this = not rotating
static const float ROTATE_DEGREES_PER_RATE = 0.12f;  // gyro deg/s → view degrees/frame
static const float ROTATE_MAGNITUDE_RATE = 250.0f;   // deg/s that maps to full magnitude

// --- Move (accel tilt): held tilt away from the neutral anchor -------------
// Direction only — finger geometry has no notion of "which way", so this
// stays IMU-driven exactly as before; only the entry condition (index-only)
// changed.
static const float MOVE_TILT_DEADZONE_DEG = 12.0f;

// --- Hold-repeat (Move/ResizeUp/ResizeDown): one immediate step, then a
// slower repeat while the pose is held — same cadence as the webcam track's
// holdRepeat.ts (HOLD_REPEAT_DELAY_MS / HOLD_REPEAT_INTERVAL_MS there).
static const uint32_t HOLD_REPEAT_DELAY_MS = 400;
static const uint32_t HOLD_REPEAT_INTERVAL_MS = 180;
static const float INITIAL_STEP_MAGNITUDE = 1.0f;
static const float REPEAT_STEP_MAGNITUDE = 0.35f;

// --- Debounce ---------------------------------------------------------------
// A newly-classified gesture TYPE must stay stable this long before it starts
// firing, so hand transitions don't spit spurious gestures. The 1<->2 and
// 2<->3 finger transitions are the most flicker-prone — test those first.
static const uint32_t DEBOUNCE_MS = 150;

namespace gestures {
namespace {

bool haveAnchor = false;
float anchorRoll = 0;
float anchorPitch = 0;

Gesture pendingType = Gesture::None;
uint32_t pendingSince = 0;
Gesture stableType = Gesture::None;

// Hold-repeat state for the currently-stable Move/ResizeUp/ResizeDown type.
Gesture holdType = Gesture::None;
uint32_t holdSince = 0;
uint32_t holdLastFire = 0;

bool curled(const SensorFrame &f, int finger) { return f.flex[finger] > FLEX_CURL_THRESHOLD; }

// Runs the debounce state machine. Returns true once `type` has been stable
// for DEBOUNCE_MS (and every frame after, while it stays that type).
bool debounced(Gesture type, uint32_t now) {
  if (type != pendingType) {
    pendingType = type;
    pendingSince = now;
    return type == stableType;  // staying on an already-stable type keeps firing
  }
  if (now - pendingSince >= DEBOUNCE_MS) {
    stableType = type;
    return true;
  }
  return stableType == type;
}

// C++ equivalent of holdRepeat.ts: given a debounce-stable gesture type,
// decides whether THIS frame should actually emit — an immediate step the
// instant the type becomes stable, then a repeat every HOLD_REPEAT_INTERVAL_MS
// once HOLD_REPEAT_DELAY_MS has elapsed, nothing in between.
bool holdRepeatGate(Gesture type, uint32_t now, float &magnitudeOut) {
  if (type != holdType) {
    holdType = type;
    holdSince = now;
    holdLastFire = now;
    magnitudeOut = INITIAL_STEP_MAGNITUDE;
    return true;
  }
  if (now - holdSince < HOLD_REPEAT_DELAY_MS) return false;
  if (now - holdLastFire < HOLD_REPEAT_INTERVAL_MS) return false;
  holdLastFire = now;
  magnitudeOut = REPEAT_STEP_MAGNITUDE;
  return true;
}

float clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

}  // namespace

void reset() {
  haveAnchor = false;
  pendingType = Gesture::None;
  stableType = Gesture::None;
  holdType = Gesture::None;
}

bool classify(const SensorFrame &f, uint32_t nowMs, GestureEvent &out) {
  out.timestamp = nowMs;
  out.direction = MoveDir::None;
  out.signedDelta = 0;

  const bool thumbExtended = !curled(f, kThumb);
  const bool indexExtended = !curled(f, kIndex);
  const bool middleExtended = !curled(f, kMiddle);
  const bool ringExtended = !curled(f, kRing);
  const bool pinkyExtended = !curled(f, kPinky);

  const bool moveShape = indexExtended && !middleExtended && !ringExtended && !pinkyExtended;
  const bool increaseShape = indexExtended && middleExtended && !ringExtended && !pinkyExtended;
  const bool decreaseShape = indexExtended && middleExtended && ringExtended && !pinkyExtended;
  const bool openPalmShape = thumbExtended && indexExtended && middleExtended && ringExtended && pinkyExtended;

  // Anchor the IMU tilt/rotate reference on any frame the hand isn't mid
  // finger-pose-transition — re-centers whenever tracking would otherwise be
  // ambiguous, same intent as the webcam track's per-loss re-anchor.
  if (!haveAnchor) {
    anchorRoll = f.roll;
    anchorPitch = f.pitch;
    haveAnchor = true;
  }

  // --- Rotate: open palm + active twist — continuous, not hold-repeat -------
  if (openPalmShape) {
    const float twistRate = f.gyro[GYRO_TWIST_AXIS];
    if (fabsf(twistRate) > ROTATE_RATE_DEADZONE) {
      if (!debounced(Gesture::Rotate, nowMs)) return false;
      out.gesture = Gesture::Rotate;
      out.magnitude = clamp01(fabsf(twistRate) / ROTATE_MAGNITUDE_RATE);
      out.signedDelta = twistRate * ROTATE_DEGREES_PER_RATE;
      return true;
    }
    debounced(Gesture::None, nowMs);
    return false;
  }

  // --- Increase / Decrease: index+middle(+ring) — hold-repeat ---------------
  if (decreaseShape) {
    if (!debounced(Gesture::ResizeDown, nowMs)) return false;
    float magnitude;
    if (!holdRepeatGate(Gesture::ResizeDown, nowMs, magnitude)) return false;
    out.gesture = Gesture::ResizeDown;
    out.magnitude = magnitude;
    return true;
  }
  if (increaseShape) {
    if (!debounced(Gesture::ResizeUp, nowMs)) return false;
    float magnitude;
    if (!holdRepeatGate(Gesture::ResizeUp, nowMs, magnitude)) return false;
    out.gesture = Gesture::ResizeUp;
    out.magnitude = magnitude;
    return true;
  }

  // --- Move: index only — direction from held tilt, hold-repeat -------------
  if (moveShape) {
    const float dRoll = f.roll - anchorRoll;
    const float dPitch = f.pitch - anchorPitch;
    const float tilt = fmaxf(fabsf(dRoll), fabsf(dPitch));
    MoveDir direction = MoveDir::None;
    if (tilt > MOVE_TILT_DEADZONE_DEG) {
      direction = fabsf(dPitch) > fabsf(dRoll) ? (dPitch > 0 ? MoveDir::Up : MoveDir::Down)
                                                : (dRoll > 0 ? MoveDir::Right : MoveDir::Left);
    }
    if (direction == MoveDir::None) {
      debounced(Gesture::None, nowMs);
      return false;
    }
    if (!debounced(Gesture::Move, nowMs)) return false;
    float magnitude;
    if (!holdRepeatGate(Gesture::Move, nowMs, magnitude)) return false;
    out.gesture = Gesture::Move;
    out.direction = direction;
    out.magnitude = magnitude;
    return true;
  }

  // Neutral / unmapped finger combination (e.g. four fingers) — nothing to
  // emit, let the debounce and hold-repeat state settle back to None.
  debounced(Gesture::None, nowMs);
  holdType = Gesture::None;
  return false;
}

}  // namespace gestures
