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

## Gesture mapping

Finger-count scheme — matches the webcam track exactly, just read from flex
sensors instead of a camera:

| Gesture       | Finger pose                          | Direction/twist source |
| ------------- | ------------------------------------- | --------------- |
| `move`        | index finger only extended            | accel tilt from anchor (up/down/left/right) |
| `resize_up`   | index + middle extended               | — (hold-repeat step) |
| `resize_down` | index + middle + ring extended        | — (hold-repeat step) |
| `rotate`      | all five extended (open palm) + twist | gyro (twist rate) |

Any other combination (e.g. four fingers) is deliberately unmapped — neutral,
no action. `rotate` is a **held pose**: holding it keeps emitting (~50Hz)
instead of firing once. `move`/`resize_up`/`resize_down` instead fire as
discrete hold-repeat steps — one immediate step the instant the finger pose
is stable, then a slower repeat every ~180ms while it's held, same cadence as
the webcam track's `holdRepeat.ts`. Move/rotate's tilt/twist reference
re-centers to wherever your hand rests when it returns to neutral (no
dedicated recenter gesture). Priority per frame is rotate → resize → move.

Honest limitation: the MPU6050 has no magnetometer, so there's no reliable yaw.
`move` gets up/down from pitch and left/right from roll, and `rotate` uses the
gyro twist *rate* (an active motion) specifically so it stays separable from a
held tilt. This is the clean, reliable 4-gesture split for a single 6-DOF IMU —
matching the "reliability over more gestures" mandate.

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
travel), `ROTATE_RATE_DEADZONE`, `MOVE_TILT_DEADZONE_DEG`,
`HOLD_REPEAT_DELAY_MS`/`HOLD_REPEAT_INTERVAL_MS`, etc.
Set `DEBUG_SERIAL 0` for battery/production use.

## BLE contract

- Service UUID `6d7a9f10-2c3b-4e5a-8f21-9b0c1d2e3f40`
- Characteristic UUID `6d7a9f11-2c3b-4e5a-8f21-9b0c1d2e3f40` (read + notify)
- 14-byte little-endian payload: `gesture:u8, direction:u8, magnitude:f32,
  signedDelta:f32, timestamp:u32`

These must match `frontend/src/lib/gloveGesture.ts` exactly.
