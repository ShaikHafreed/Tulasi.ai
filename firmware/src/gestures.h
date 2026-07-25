#pragma once

#include <Arduino.h>
#include "sensors.h"

// Mirrors the webcam track's GestureType/GestureEvent (frontend
// webcamGesture.ts) so both tracks feed the same gestureToCommand.ts mapper.
// Numeric values are the on-the-wire BLE payload encoding — keep them in sync
// with the parser in gloveGesture.ts.
enum class Gesture : uint8_t {
  Rotate = 0,
  Move = 1,
  ResizeUp = 2,
  ResizeDown = 3,
  None = 255,
};

struct GestureEvent {
  Gesture gesture;
  // Continuous 360° direction, degrees, standard math convention (0=+X,
  // 90=+Y) — meaningful only for Move. Supersedes the old MoveDir 4-way
  // enum (gesture v3): no more directional bucket, matches the webcam
  // track's continuous angleDeg exactly.
  float angleDeg;
  float magnitude;     // 0..1
  float signedDelta;   // degrees, meaningful only for Rotate
  uint32_t timestamp;  // millis()
};

namespace gestures {

// Clears anchors/debounce state — call after calibration and whenever
// tracking should re-center (e.g. on BLE reconnect).
void reset();

// Classifies one filtered frame. Returns true and fills `out` when a gesture
// should be emitted this frame, false when the hand is neutral / mid-
// transition. Rotate and Move both emit continuously, every frame, once
// debounced. ResizeUp/ResizeDown fire via holdRepeatGate's steady-rate mode
// (condition true = past the anchor deadzone) — see gestures.cpp.
bool classify(const SensorFrame &f, uint32_t nowMs, GestureEvent &out);

}  // namespace gestures
