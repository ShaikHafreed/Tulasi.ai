#include "gestures.h"

#include <math.h>

// ===========================================================================
// Gesture-classification thresholds. These are the numbers you retune against
// the DEBUG_SERIAL stream — deliberately named constants, no magic numbers
// inline. Starting values are provisional (see firmware/README "Tuning"); the
// flex numbers in particular depend on your specific voltage dividers and
// finger travel, so expect to adjust them on the first hardware pass.
//
// Design mirrors the webcam track (frontend/src/lib/webcamGesture.ts): every
// gesture is a HELD POSE judged each frame, not a one-shot motion, so holding
// a pose keeps emitting instead of firing once and stopping. Move/rotate are
// measured against an ANCHOR captured when the hand returns to neutral — a
// joystick centered wherever the hand naturally rests.
// ===========================================================================

// --- Resize (flex): fist shrinks, splayed-flat grows -----------------------
// Mean baseline-subtracted flex across all fingers. Curling (positive) past
// CLENCH shrinks; hyper-extending/splaying (negative) past SPREAD grows.
static const float FLEX_CLENCH_THRESHOLD = 300.0f;
static const float FLEX_SPREAD_THRESHOLD = -180.0f;
static const float RESIZE_BASE_MAGNITUDE = 0.05f;
static const float RESIZE_MAGNITUDE_GAIN = 1.0f / 1200.0f;  // per ADC-count of excess

// --- Rotate (gyro twist): an ACTIVE wrist twist about the pointing axis ----
// Using the gyro rate (not static roll) keeps rotate separable from a held
// tilt used for Move — twisting produces rate, holding a tilt does not.
static const int GYRO_TWIST_AXIS = 0;  // 0=x (roll/twist), 1=y, 2=z
static const float ROTATE_RATE_DEADZONE = 25.0f;   // deg/s below this = not rotating
static const float ROTATE_DEGREES_PER_RATE = 0.12f;  // gyro deg/s → view degrees/frame
static const float ROTATE_MAGNITUDE_RATE = 250.0f;   // deg/s that maps to full magnitude

// --- Move (accel tilt): held tilt away from the neutral anchor -------------
static const float MOVE_TILT_DEADZONE_DEG = 12.0f;
static const float MOVE_MAGNITUDE_GAIN = 1.0f / 35.0f;  // per degree of excess tilt

// --- Debounce ---------------------------------------------------------------
// A newly-classified gesture TYPE must stay stable this long before it starts
// firing, so hand transitions don't spit spurious gestures.
static const uint32_t DEBOUNCE_MS = 150;

namespace gestures {
namespace {

bool haveAnchor = false;
float anchorRoll = 0;
float anchorPitch = 0;

Gesture pendingType = Gesture::None;
uint32_t pendingSince = 0;
Gesture stableType = Gesture::None;

float meanFlex(const SensorFrame &f) {
  float sum = 0;
  for (int i = 0; i < FLEX_COUNT; i++) sum += f.flex[i];
  return sum / FLEX_COUNT;
}

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

float clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

}  // namespace

void reset() {
  haveAnchor = false;
  pendingType = Gesture::None;
  stableType = Gesture::None;
}

bool classify(const SensorFrame &f, uint32_t nowMs, GestureEvent &out) {
  const float flex = meanFlex(f);
  out.timestamp = nowMs;
  out.direction = MoveDir::None;
  out.signedDelta = 0;

  // Priority: resize (deliberate finger pose) > rotate (active twist) > move
  // (held tilt). One gesture per frame, matching the webcam track's ordering.

  // --- Resize ---------------------------------------------------------------
  if (flex > FLEX_CLENCH_THRESHOLD) {
    if (!debounced(Gesture::ResizeDown, nowMs)) return false;
    out.gesture = Gesture::ResizeDown;
    out.magnitude = clamp01(RESIZE_BASE_MAGNITUDE + (flex - FLEX_CLENCH_THRESHOLD) * RESIZE_MAGNITUDE_GAIN);
    haveAnchor = false;  // fingers moved — re-center the tilt joystick on return
    return true;
  }
  if (flex < FLEX_SPREAD_THRESHOLD) {
    if (!debounced(Gesture::ResizeUp, nowMs)) return false;
    out.gesture = Gesture::ResizeUp;
    out.magnitude = clamp01(RESIZE_BASE_MAGNITUDE + (FLEX_SPREAD_THRESHOLD - flex) * RESIZE_MAGNITUDE_GAIN);
    haveAnchor = false;
    return true;
  }

  // Hand is in a neutral (relaxed, roughly flat) shape → IMU gestures. Anchor
  // the tilt reference here the first neutral frame.
  if (!haveAnchor) {
    anchorRoll = f.roll;
    anchorPitch = f.pitch;
    haveAnchor = true;
  }

  // --- Rotate (active twist) ------------------------------------------------
  const float twistRate = f.gyro[GYRO_TWIST_AXIS];
  if (fabsf(twistRate) > ROTATE_RATE_DEADZONE) {
    if (!debounced(Gesture::Rotate, nowMs)) return false;
    out.gesture = Gesture::Rotate;
    out.magnitude = clamp01(fabsf(twistRate) / ROTATE_MAGNITUDE_RATE);
    out.signedDelta = twistRate * ROTATE_DEGREES_PER_RATE;
    return true;
  }

  // --- Move (held tilt from anchor) -----------------------------------------
  const float dRoll = f.roll - anchorRoll;    // left/right
  const float dPitch = f.pitch - anchorPitch; // up/down
  const float tilt = fmaxf(fabsf(dRoll), fabsf(dPitch));
  if (tilt > MOVE_TILT_DEADZONE_DEG) {
    if (!debounced(Gesture::Move, nowMs)) return false;
    out.gesture = Gesture::Move;
    if (fabsf(dPitch) > fabsf(dRoll)) {
      out.direction = dPitch > 0 ? MoveDir::Up : MoveDir::Down;
    } else {
      out.direction = dRoll > 0 ? MoveDir::Right : MoveDir::Left;
    }
    out.magnitude = clamp01((tilt - MOVE_TILT_DEADZONE_DEG) * MOVE_MAGNITUDE_GAIN);
    return true;
  }

  // Neutral — nothing to emit, and let the debounce settle to None.
  debounced(Gesture::None, nowMs);
  return false;
}

}  // namespace gestures
