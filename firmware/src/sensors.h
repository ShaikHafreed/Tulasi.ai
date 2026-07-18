#pragma once

#include <Arduino.h>
#include "config.h"

// One filtered, calibrated sample of the whole glove. flex[] is the
// baseline-subtracted bend for each finger (0 ≈ relaxed, positive ≈ curled,
// negative ≈ hyper-extended/splayed); flexRaw[] keeps the pre-baseline ADC
// values for the debug stream. roll/pitch are degrees from the accelerometer,
// gyro is deg/s.
struct SensorFrame {
  float flex[FLEX_COUNT];
  float flexRaw[FLEX_COUNT];
  float roll;
  float pitch;
  float gyro[3];   // x, y, z (deg/s)
  float accel[3];  // x, y, z (m/s^2)
};

namespace sensors {

// Initialises ADC + I2C + the MPU6050. Returns false if the IMU isn't found
// so main.cpp can halt with a clear message instead of streaming garbage.
bool begin();

// Blocks for CALIBRATION_MS averaging flex readings into the zero-reference.
// Call once, after begin(), before the sample loop.
void calibrate();

bool calibrated();

// Fills `out` with one moving-average-filtered sample. Cheap enough to call
// every loop; it advances the filter ring buffers internally.
void read(SensorFrame &out);

}  // namespace sensors
