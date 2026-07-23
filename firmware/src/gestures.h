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

enum class MoveDir : uint8_t {
  None = 0,
  Up = 1,
  Down = 2,
  Left = 3,
  Right = 4,
};

struct GestureEvent {
  Gesture gesture;
  MoveDir direction;   // meaningful only for Move
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
// transition. Rotate emits continuously, every frame, once debounced (an
// active twist, not a held shape). Move/ResizeUp/ResizeDown are discrete
// hold-repeat steps instead — one immediate step when the finger pose
// becomes stable, then a slower repeat while it's held, matching the webcam
// track's holdRepeat.ts.
bool classify(const SensorFrame &f, uint32_t nowMs, GestureEvent &out);

}  // namespace gestures
