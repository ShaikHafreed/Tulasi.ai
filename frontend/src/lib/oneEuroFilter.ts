// Standard One-Euro filter (Casiez, Roussel, Vogel — "1€ Filter: A Simple
// Speed-based Low-pass Filter for Noisy Input in Interactive Systems").
// Adapts its cutoff to the signal's speed: near-still input gets heavy
// smoothing (kills jitter), fast movement gets light smoothing (kills lag)
// — the property a fixed-alpha EMA doesn't have. Used to filter raw hand
// landmark positions before any gesture classification touches them.
export interface OneEuroFilterOptions {
  minCutoff?: number // Hz — lower = smoother when nearly still
  beta?: number // higher = less lag when moving fast, but more jitter then
  dCutoff?: number // Hz — cutoff for the derivative estimate itself
}

class LowPass {
  private y: number | null = null

  filter(x: number, alpha: number): number {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y
    return this.y
  }

  reset(): void {
    this.y = null
  }
}

function alpha(cutoffHz: number, dtSeconds: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz)
  return 1 / (1 + tau / dtSeconds)
}

export class OneEuroFilter {
  private readonly minCutoff: number
  private readonly beta: number
  private readonly dCutoff: number
  private readonly xFilter = new LowPass()
  private readonly dxFilter = new LowPass()
  private lastValue: number | null = null
  private lastTime: number | null = null

  constructor(options: OneEuroFilterOptions = {}) {
    this.minCutoff = options.minCutoff ?? 1.0
    this.beta = options.beta ?? 0.0
    this.dCutoff = options.dCutoff ?? 1.0
  }

  // timeSeconds must be monotonically increasing (e.g. performance.now()/1000).
  filter(value: number, timeSeconds: number): number {
    if (this.lastTime === null) {
      this.lastTime = timeSeconds
      this.lastValue = value
      return this.xFilter.filter(value, 1) // first sample: pass through, seed the filter
    }
    const dt = Math.max(timeSeconds - this.lastTime, 1 / 120) // guard div-by-zero on duplicate timestamps
    this.lastTime = timeSeconds

    const dx = (value - (this.lastValue ?? value)) / dt
    this.lastValue = value
    const edx = this.dxFilter.filter(dx, alpha(this.dCutoff, dt))

    const cutoff = this.minCutoff + this.beta * Math.abs(edx)
    return this.xFilter.filter(value, alpha(cutoff, dt))
  }

  reset(): void {
    this.xFilter.reset()
    this.dxFilter.reset()
    this.lastValue = null
    this.lastTime = null
  }
}

// Filters a whole set of landmarks (x, y, z each) with one OneEuroFilter per
// scalar component, plus outlier rejection: a raw sample that jumps further
// than physically plausible in one frame is discarded outright — the last
// filtered value is reused instead of feeding the spike into the filter,
// which a low-pass filter alone can't fully suppress (it would just lag the
// spike instead of ignoring it).
export class LandmarkFilter {
  private filters: OneEuroFilter[][] | null = null // [landmarkIndex][x|y|z]
  private lastFiltered: Array<{ x: number; y: number; z: number }> | null = null
  private readonly count: number
  private readonly maxVelocityPerSecond: number
  private readonly options: OneEuroFilterOptions

  constructor(count: number, maxVelocityPerSecond: number, options: OneEuroFilterOptions = {}) {
    this.count = count
    this.maxVelocityPerSecond = maxVelocityPerSecond
    this.options = options
  }

  filter(points: Array<{ x: number; y: number; z: number }>, timeSeconds: number): Array<{ x: number; y: number; z: number }> {
    if (!this.filters) {
      this.filters = Array.from({ length: this.count }, () => [
        new OneEuroFilter(this.options),
        new OneEuroFilter(this.options),
        new OneEuroFilter(this.options),
      ])
      this.lastFiltered = points.map((p) => ({ ...p }))
      return this.lastFiltered
    }

    const dt = Math.max(1 / 120, 1 / 30) // conservative fixed step for the velocity clamp (frame interval varies, but the clamp only needs to be "roughly per-frame")
    const out = points.map((raw, i) => {
      const prev = this.lastFiltered![i]
      const clamped = { x: raw.x, y: raw.y, z: raw.z }
      for (const axis of ['x', 'y', 'z'] as const) {
        if (Math.abs(raw[axis] - prev[axis]) > this.maxVelocityPerSecond * dt) {
          clamped[axis] = prev[axis] // reject the spike — reuse the last filtered value
        }
      }
      const [fx, fy, fz] = this.filters![i]
      return {
        x: fx.filter(clamped.x, timeSeconds),
        y: fy.filter(clamped.y, timeSeconds),
        z: fz.filter(clamped.z, timeSeconds),
      }
    })
    this.lastFiltered = out
    return out
  }

  reset(): void {
    this.filters = null
    this.lastFiltered = null
  }
}
