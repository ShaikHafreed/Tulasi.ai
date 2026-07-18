#include "sensors.h"

#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>

namespace sensors {
namespace {

Adafruit_MPU6050 mpu;

// Per-channel moving-average ring buffers (window of FILTER_WINDOW). Reduces
// ADC jitter before it ever reaches classification — the spec calls for this
// explicitly so a noisy finger doesn't flicker gestures.
float flexRing[FLEX_COUNT][FILTER_WINDOW];
int flexRingPos = 0;
bool flexRingFilled = false;

float baseline[FLEX_COUNT] = {0};
bool isCalibrated = false;

float movingAverage(int channel) {
  const int count = flexRingFilled ? FILTER_WINDOW : (flexRingPos == 0 ? 1 : flexRingPos);
  float sum = 0;
  for (int i = 0; i < count; i++) sum += flexRing[channel][i];
  return sum / count;
}

// Reads all flex pins into the ring buffer and returns the filtered value for
// each channel via `filtered`.
void sampleFlex(float filtered[FLEX_COUNT]) {
  for (int i = 0; i < FLEX_COUNT; i++) {
    flexRing[i][flexRingPos] = analogRead(FLEX_PINS[i]);
  }
  flexRingPos = (flexRingPos + 1) % FILTER_WINDOW;
  if (flexRingPos == 0) flexRingFilled = true;
  for (int i = 0; i < FLEX_COUNT; i++) filtered[i] = movingAverage(i);
}

}  // namespace

bool begin() {
  analogReadResolution(12);              // 0..4095
  for (int i = 0; i < FLEX_COUNT; i++) {
    // 11dB attenuation → ~0..3.3V full-scale, matches a 3.3V divider rail.
    analogSetPinAttenuation(FLEX_PINS[i], ADC_11db);
    pinMode(FLEX_PINS[i], INPUT);
  }

  Wire.begin(I2C_SDA, I2C_SCL);
  if (!mpu.begin()) return false;

  mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  return true;
}

void calibrate() {
  // Prime the filter so the very first post-calibration read isn't skewed by
  // an empty ring buffer.
  float scratch[FLEX_COUNT];
  double accum[FLEX_COUNT] = {0};
  uint32_t samples = 0;
  const uint32_t start = millis();

  while (millis() - start < CALIBRATION_MS) {
    sampleFlex(scratch);
    for (int i = 0; i < FLEX_COUNT; i++) accum[i] += scratch[i];
    samples++;
    delay(SAMPLE_INTERVAL_MS);
  }

  for (int i = 0; i < FLEX_COUNT; i++) {
    baseline[i] = samples ? static_cast<float>(accum[i] / samples) : scratch[i];
  }
  isCalibrated = true;
}

bool calibrated() { return isCalibrated; }

void read(SensorFrame &out) {
  float filtered[FLEX_COUNT];
  sampleFlex(filtered);
  for (int i = 0; i < FLEX_COUNT; i++) {
    out.flexRaw[i] = filtered[i];
    out.flex[i] = filtered[i] - baseline[i];
  }

  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  out.accel[0] = a.acceleration.x;
  out.accel[1] = a.acceleration.y;
  out.accel[2] = a.acceleration.z;

  // gyro is rad/s from the library — convert to deg/s for readable thresholds.
  out.gyro[0] = g.gyro.x * RAD_TO_DEG;
  out.gyro[1] = g.gyro.y * RAD_TO_DEG;
  out.gyro[2] = g.gyro.z * RAD_TO_DEG;

  // Static tilt from gravity. roll = rotation about the pointing (X) axis,
  // pitch = tilt of the hand up/down. Good enough as an absolute "held
  // joystick" reference without needing a magnetometer (the MPU6050 has none,
  // so true yaw isn't available — see gestures.cpp for how that shapes the
  // gesture mapping).
  out.roll = atan2(out.accel[1], out.accel[2]) * RAD_TO_DEG;
  out.pitch = atan2(-out.accel[0], sqrt(out.accel[1] * out.accel[1] + out.accel[2] * out.accel[2])) * RAD_TO_DEG;
}

}  // namespace sensors
