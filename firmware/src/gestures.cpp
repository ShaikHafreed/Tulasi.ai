#include "gestures.h"

#include <math.h>

// ===========================================================================
// Gesture-classification thresholds. These are the numbers you retune against
// the DEBUG_SERIAL stream — deliberately named constants, no magic numbers
// inline. Starting values are provisional (see firmware/README "Tuning"); the
// flex numbers in particular depend on your specific voltage dividers and
// finger travel, so expect to adjust them on the first hardware pass.
//
// FINGER-COUNT SCHEME v3 — mirrors the webcam track (frontend/src/lib/
// webcamGesture.ts). 3-finger decrease pose REMOVED entirely (was the most
// flicker-prone transition); Move is continuous 360°, not tilt-bucketed:
//   index only               -> Move, continuous direction from smoothed
//                                roll/pitch, no more 4-way bucket
//   index + middle            -> Resize: above a pitch anchor = continuous
//                                increase, below = continuous decrease,
//                                deadzone near the anchor = no change
//   all five extended + twist -> Rotate — unchanged continuous behavior
// Any other combination (e.g. three or four fingers) is unmapped.
// ===========================================================================

// --- Per-finger curl detection ----------------------------------------------
// SensorFrame::flex[] is baseline-subtracted, ordered thumb->pinky (matches
// FLEX_PINS in config.h): positive = curled toward the palm, ~0 = relaxed/
// straight. A finger counts as "extended" when it's NOT curled past this.
static const float FLEX_CURL_THRESHOLD = 250.0f;

enum FingerIndex { kThumb = 0, kIndex = 1, kMiddle = 2, kRing = 3, kPinky = 4 };

// --- Rotate (gyro twist): an ACTIVE wrist twist about the pointing axis ----
static const int GYRO_TWIST_AXIS = 0;  // 0=x (roll/twist), 1=y, 2=z
static const float ROTATE_RATE_DEADZONE = 25.0f;   // deg/s below this = not rotating
static const float ROTATE_DEGREES_PER_RATE = 0.12f;  // gyro deg/s → view degrees/frame
static const float ROTATE_MAGNITUDE_RATE = 250.0f;   // deg/s that maps to full magnitude

// --- Move (accel tilt): continuous direction, smoothed the same way the
// webcam track smooths its pointing vector — EMA over the raw roll/pitch
// signal itself (not the angle computed from it), so there's no wraparound
// artifact. Weight on the NEW sample each frame — tune by feel.
static const float TILT_SMOOTHING_FACTOR = 0.3f;

// --- Resize (tilt vs. anchor): pitch relative to the value captured the
// instant the 2-finger pose was entered.
static const float RESIZE_DEADZONE_DEG = 6.0f;
static const float RESIZE_STEP_MAGNITUDE = 0.4f;

// --- Hold-repeat (Resize only now — Move is continuous like Rotate): a
// steady rate for as long as the pose is past the deadzone, no initial-delay
// gap — same cadence as the webcam track's holdRepeat.ts immediateRepeat mode.
static const uint32_t HOLD_REPEAT_INTERVAL_MS = 180;

// --- Debounce ---------------------------------------------------------------
// A newly-classified gesture TYPE must stay stable this long before it starts
// firing, so hand transitions don't spit spurious gestures. The 1<->2 finger
// transition is the most flicker-prone — test that first.
static const uint32_t DEBOUNCE_MS = 150;

namespace gestures {
namespace {

bool haveAnchor = false;
float anchorRoll = 0;
float anchorPitch = 0;

// Smoothed roll/pitch, updated every frame regardless of pose (same reasoning
// as the webcam track: already warmed up by the time Move starts, no lag).
bool haveSmoothed = false;
float smoothedRoll = 0;
float smoothedPitch = 0;

// Resize's pitch anchor — captured fresh each time the 2-finger pose is
// entered, cleared the instant it isn't.
bool haveResizeAnchor = false;
float resizeAnchorPitch = 0;

Gesture pendingType = Gesture::None;
uint32_t pendingSince = 0;
Gesture stableType = Gesture::None;

// Steady-rate state for the currently-stable Resize direction.
Gesture holdType = Gesture::None;
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

// C++ equivalent of holdRepeat.ts's immediateRepeat mode: given a
// debounce-stable gesture type, fires immediately on entry, then every
// HOLD_REPEAT_INTERVAL_MS with no initial-delay gap — a steady rate from
// the start, not an arrow-key-style pause-then-repeat.
bool holdRepeatGate(Gesture type, uint32_t now) {
  if (type != holdType) {
    holdType = type;
    holdLastFire = now;
    return true;
  }
  if (now - holdLastFire < HOLD_REPEAT_INTERVAL_MS) return false;
  holdLastFire = now;
  return true;
}

float clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

}  // namespace

void reset() {
  haveAnchor = false;
  haveSmoothed = false;
  haveResizeAnchor = false;
  pendingType = Gesture::None;
  stableType = Gesture::None;
  holdType = Gesture::None;
}

bool classify(const SensorFrame &f, uint32_t nowMs, GestureEvent &out) {
  out.timestamp = nowMs;
  out.angleDeg = 0;
  out.signedDelta = 0;

  const bool thumbExtended = !curled(f, kThumb);
  const bool indexExtended = !curled(f, kIndex);
  const bool middleExtended = !curled(f, kMiddle);
  const bool ringExtended = !curled(f, kRing);
  const bool pinkyExtended = !curled(f, kPinky);

  const bool moveShape = indexExtended && !middleExtended && !ringExtended && !pinkyExtended;
  const bool resizeShape = indexExtended && middleExtended && !ringExtended && !pinkyExtended;
  const bool openPalmShape = thumbExtended && indexExtended && middleExtended && ringExtended && pinkyExtended;

  // Anchor the rotate-twist reference on any frame the hand isn't mid
  // finger-pose-transition — re-centers whenever tracking would otherwise be
  // ambiguous, same intent as the webcam track's per-loss re-anchor.
  if (!haveAnchor) {
    anchorRoll = f.roll;
    anchorPitch = f.pitch;
    haveAnchor = true;
  }

  // Smooth roll/pitch continuously (see TILT_SMOOTHING_FACTOR's comment).
  if (!haveSmoothed) {
    smoothedRoll = f.roll;
    smoothedPitch = f.pitch;
    haveSmoothed = true;
  } else {
    smoothedRoll = smoothedRoll * (1 - TILT_SMOOTHING_FACTOR) + f.roll * TILT_SMOOTHING_FACTOR;
    smoothedPitch = smoothedPitch * (1 - TILT_SMOOTHING_FACTOR) + f.pitch * TILT_SMOOTHING_FACTOR;
  }

  // Resize's pitch anchor — captured on pose entry, cleared on pose exit.
  if (resizeShape) {
    if (!haveResizeAnchor) {
      resizeAnchorPitch = f.pitch;
      haveResizeAnchor = true;
    }
  } else {
    haveResizeAnchor = false;
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

  // --- Resize: index+middle — steady-rate while past the pitch deadzone -----
  if (resizeShape) {
    const float deltaPitch = f.pitch - resizeAnchorPitch;
    if (fabsf(deltaPitch) < RESIZE_DEADZONE_DEG) {
      debounced(Gesture::None, nowMs);
      holdType = Gesture::None;
      return false;
    }
    const Gesture type = deltaPitch > 0 ? Gesture::ResizeUp : Gesture::ResizeDown;
    if (!debounced(type, nowMs)) return false;
    if (!holdRepeatGate(type, nowMs)) return false;
    out.gesture = type;
    out.magnitude = RESIZE_STEP_MAGNITUDE;
    return true;
  }

  // --- Move: index only — continuous direction from smoothed tilt -----------
  if (moveShape) {
    const float dRoll = smoothedRoll - anchorRoll;
    const float dPitch = smoothedPitch - anchorPitch;
    if (!debounced(Gesture::Move, nowMs)) return false;
    out.gesture = Gesture::Move;
    // Treats roll as the x-equivalent axis, pitch as y — unverified against
    // real hardware (no physical glove exists yet), may need the axes
    // swapped or a sign flipped once it does; tune this on the first
    // hardware pass same as the flex/tilt thresholds above.
    out.angleDeg = atan2f(dPitch, dRoll) * 180.0f / static_cast<float>(M_PI);
    out.magnitude = 1.0f;
    return true;
  }

  // Neutral / unmapped finger combination (e.g. three or four fingers) —
  // nothing to emit, let the debounce and hold-repeat state settle back.
  debounced(Gesture::None, nowMs);
  holdType = Gesture::None;
  return false;
}

}  // namespace gestures
