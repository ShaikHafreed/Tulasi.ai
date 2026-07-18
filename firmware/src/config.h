#pragma once

// ---------------------------------------------------------------------------
// Hardware wiring + runtime config. Gesture-classification thresholds do NOT
// live here — they're named constants at the top of gestures.cpp, per the
// build spec, since those are the numbers you retune against real sensor
// values. This file is pins, timing, and BLE identity only.
// ---------------------------------------------------------------------------

// Flip to 1 to stream raw + classified values over the serial monitor for
// calibration. Verify the raw numbers look sane (fingers bend → flex values
// move, wrist twist → gyro moves) BEFORE trusting any classified gesture —
// this is the whole point of the tuning workflow in the build order.
#define DEBUG_SERIAL 1

// --- Flex sensors -----------------------------------------------------------
// One per finger, each wired as a voltage divider into an ADC1 pin (ADC1 is
// safe alongside BLE; ADC2 pins are not — they clash with the radio). Order
// is thumb → pinky; it only has to stay consistent, the absolute mapping
// doesn't matter to the classifier.
constexpr int FLEX_PINS[5] = {36, 39, 34, 35, 32};
constexpr int FLEX_COUNT = 5;

// --- MPU6050 (I2C) ----------------------------------------------------------
// Default ESP32 I2C pins. The Adafruit library uses Wire, so these are the
// SDA/SCL it expects unless you remap Wire.begin().
constexpr int I2C_SDA = 21;
constexpr int I2C_SCL = 22;

// --- Sampling / filtering ---------------------------------------------------
constexpr uint32_t SAMPLE_HZ = 50;                       // spec: 50Hz
constexpr uint32_t SAMPLE_INTERVAL_MS = 1000 / SAMPLE_HZ; // 20ms
constexpr int FILTER_WINDOW = 5;                          // moving-average span

// --- Calibration ------------------------------------------------------------
// Hold the hand flat and relaxed for this long on boot to record the
// zero-reference flex values. Without it gestures misfire, so it is not
// skippable — main.cpp blocks here before the loop starts.
constexpr uint32_t CALIBRATION_MS = 3000;

// --- BLE identity -----------------------------------------------------------
// Custom 128-bit UUIDs — must match SERVICE_UUID / CHARACTERISTIC_UUID in
// frontend/src/lib/gloveGesture.ts exactly, or Web Bluetooth won't find us.
#define BLE_DEVICE_NAME        "Tulasi Gesture Glove"
#define GESTURE_SERVICE_UUID   "6d7a9f10-2c3b-4e5a-8f21-9b0c1d2e3f40"
#define GESTURE_CHAR_UUID      "6d7a9f11-2c3b-4e5a-8f21-9b0c1d2e3f40"
