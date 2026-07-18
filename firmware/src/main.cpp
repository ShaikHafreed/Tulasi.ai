#include <Arduino.h>

#include "ble_broadcast.h"
#include "config.h"
#include "gestures.h"
#include "sensors.h"

namespace {

const char *gestureName(Gesture g) {
  switch (g) {
    case Gesture::Rotate: return "rotate";
    case Gesture::Move: return "move";
    case Gesture::ResizeUp: return "resize_up";
    case Gesture::ResizeDown: return "resize_down";
    default: return "none";
  }
}

const char *dirName(MoveDir d) {
  switch (d) {
    case MoveDir::Up: return "up";
    case MoveDir::Down: return "down";
    case MoveDir::Left: return "left";
    case MoveDir::Right: return "right";
    default: return "-";
  }
}

uint32_t lastSample = 0;

#if DEBUG_SERIAL
uint32_t lastDebug = 0;
void printDebug(const SensorFrame &f) {
  // Raw values first — verify THESE look sane before trusting gestures.
  Serial.print("flex ");
  for (int i = 0; i < FLEX_COUNT; i++) {
    Serial.print(f.flex[i], 0);
    Serial.print(i < FLEX_COUNT - 1 ? "," : "  ");
  }
  Serial.print("roll ");
  Serial.print(f.roll, 1);
  Serial.print("  pitch ");
  Serial.print(f.pitch, 1);
  Serial.print("  gyro ");
  Serial.print(f.gyro[0], 0);
  Serial.print(",");
  Serial.print(f.gyro[1], 0);
  Serial.print(",");
  Serial.print(f.gyro[2], 0);
  Serial.print("  ble ");
  Serial.println(ble::connected() ? "up" : "down");
}
#endif

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println("Tulasi gesture glove booting...");

  if (!sensors::begin()) {
    Serial.println("FATAL: MPU6050 not found — check I2C wiring (SDA/SCL/power).");
    // Halt loudly rather than stream garbage.
    while (true) delay(1000);
  }

  Serial.println("Calibrating — hold your hand flat and relaxed...");
  sensors::calibrate();
  gestures::reset();
  Serial.println("Calibration done.");

  ble::begin();
  Serial.println("BLE advertising as \"" BLE_DEVICE_NAME "\". Ready.");
}

void loop() {
  const uint32_t now = millis();
  if (now - lastSample < SAMPLE_INTERVAL_MS) return;  // hold ~50Hz
  lastSample = now;

  SensorFrame frame;
  sensors::read(frame);

  GestureEvent event;
  if (gestures::classify(frame, now, event)) {
    ble::notify(event);
#if DEBUG_SERIAL
    Serial.print(">> ");
    Serial.print(gestureName(event.gesture));
    Serial.print("  mag ");
    Serial.print(event.magnitude, 2);
    if (event.gesture == Gesture::Move) {
      Serial.print("  dir ");
      Serial.print(dirName(event.direction));
    }
    if (event.gesture == Gesture::Rotate) {
      Serial.print("  d ");
      Serial.print(event.signedDelta, 1);
    }
    Serial.println();
#endif
  }

#if DEBUG_SERIAL
  if (now - lastDebug >= 250) {  // 4Hz raw dump, don't flood the monitor
    lastDebug = now;
    printDebug(frame);
  }
#else
  (void)gestureName;
  (void)dirName;
#endif
}
