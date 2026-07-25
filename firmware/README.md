# Tulasi gesture glove — ESP32 firmware (Track 2)

Reads a 5-flex-sensor + MPU6050 glove, calibrates on boot, classifies the
same 4 gestures the webcam track produces, and broadcasts them over BLE for
the browser bridge (`frontend/src/lib/gloveGesture.ts`) to map through the
existing `tulasiCommands.ts` whitelist.

> **Track 1 first.** Per the build order, validate the webcam gestures and
> settle the thresholds there before trusting these. This firmware reuses the
> same held-pose/anchor logic; the numbers just live against different sensors
> and **will need a tuning pass** on real hardware.

## Hardware assumed already assembled

- ESP32 dev board
- 5× flex sensors, one per finger, each a voltage divider into an **ADC1** pin
  (`36, 39, 34, 35, 32` — thumb→pinky). ADC1 only; ADC2 pins clash with the radio.
- MPU6050 IMU over I2C (`SDA=21`, `SCL=22`, 3V3 + GND)
- LiPo + charge circuit

Wiring is not this firmware's job — verify every divider and the I2C bus with a
multimeter first. Pins are all in [`src/config.h`](src/config.h) if yours differ.

## Build & flash

Needs [PlatformIO](https://platformio.org/) (VS Code extension or `pio` CLI):

```
cd firmware
pio run -t upload        # compile + flash over USB
pio device monitor       # 115200 baud serial monitor
```

## Boot sequence

1. Serial prints `booting...`; if the MPU6050 isn't found it halts with a clear
   message (fix I2C, don't ignore).
2. **Calibration** — hold your hand flat and relaxed for 3s while it records the
   flex zero-reference. Not skippable; gestures misfire without it.
3. BLE starts advertising as **"Tulasi Gesture Glove"**. Connect from the app
   (Settings → *Gesture control (glove)*).

## Gesture mapping (v3)

Finger-count scheme — matches the webcam track exactly, just read from flex
sensors instead of a camera. The 3-finger decrease pose from v2 is gone
entirely; resize is now direction-based off a single 2-finger pose:

| Gesture                 | Finger pose                          | Direction/twist source |
| ------------------------ | ------------------------------------- | --------------- |
| `move`                   | index finger only extended            | continuous angle from smoothed roll/pitch, no more 4-way bucket |
| `resize_up`/`resize_down`| index + middle extended               | pitch vs. an anchor captured on pose entry — above = increase, below = decrease |
| `rotate`                 | all five extended (open palm) + twist | gyro (twist rate) |

Any other combination (e.g. three or four fingers) is deliberately unmapped —
neutral, no action. `rotate` and `move` are both **continuous**: holding
either keeps emitting every processed frame (~50Hz), not a one-shot step —
move used to be hold-repeat, v3 drops that in favor of a live angle, same as
the webcam track. `resize_up`/`resize_down` still fire as repeated steps
while past the anchor deadzone, but now at a *steady* rate from the moment
the deadzone is cleared — no more instant-big-step-then-pause, see
`holdRepeatGate()` in `gestures.cpp`. Move's tilt reference and rotate's
twist reference both re-center to wherever your hand rests when it returns
to neutral (no dedicated recenter gesture); resize's anchor instead
re-centers every time the 2-finger pose is freshly entered. Priority per
frame is rotate → resize → move.

Honest limitation: the MPU6050 has no magnetometer, so there's no reliable
yaw. `move`'s continuous angle is `atan2(pitch, roll)` off the smoothed tilt
— which physical axis reads as which on-screen direction is unverified
without real hardware (see the comment in `gestures.cpp`) and may need an
axis swap or sign flip once a physical glove exists. `rotate` uses the gyro
twist *rate* (an active motion) specifically so it stays separable from a
held tilt.

## Tuning workflow

`DEBUG_SERIAL` is `1` by default in [`src/config.h`](src/config.h). The monitor
streams raw values at 4Hz and every classified gesture:

```
flex -12,4,-8,2,0  roll 3.1  pitch -1.4  gyro 2,-1,0  ble down
>> rotate  mag 0.42  d 6.0
```

**Verify the raw numbers move sensibly first** (bend fingers → `flex` moves,
twist wrist → `gyro` spikes, tilt → `roll`/`pitch` move) *before* trusting any
`>>` gesture line. Then adjust the named thresholds at the top of
[`src/gestures.cpp`](src/gestures.cpp) — `FLEX_CURL_THRESHOLD` (per-finger,
the one to retune first — it depends on your voltage dividers and finger
travel), `ROTATE_RATE_DEADZONE`, `TILT_SMOOTHING_FACTOR`,
`RESIZE_DEADZONE_DEG`, `HOLD_REPEAT_INTERVAL_MS`, etc.
Set `DEBUG_SERIAL 0` for battery/production use.

## BLE contract

- Service UUID `6d7a9f10-2c3b-4e5a-8f21-9b0c1d2e3f40`
- Characteristic UUID `6d7a9f11-2c3b-4e5a-8f21-9b0c1d2e3f40` (read + notify)
- 17-byte little-endian payload: `gesture:u8, angleDeg:f32, magnitude:f32,
  signedDelta:f32, timestamp:u32` (`angleDeg` replaced the old
  `direction:u8` 4-way enum in gesture v3 — continuous move direction)

These must match `frontend/src/lib/gloveGesture.ts` exactly.
