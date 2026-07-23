// Shared "hold like an arrow key" repeat timing for move/increase/decrease —
// one immediate step when a gesture starts, then (if still held past
// HOLD_REPEAT_DELAY_MS) a steady repeat every HOLD_REPEAT_INTERVAL_MS until
// the gesture ends. No residual momentum after release: stopping clears both
// timers outright, nothing fires again on its own.
export const HOLD_REPEAT_DELAY_MS = 400
export const HOLD_REPEAT_INTERVAL_MS = 180

export class HoldRepeat {
  private timer: ReturnType<typeof setTimeout> | null = null
  private interval: ReturnType<typeof setInterval> | null = null
  private activeKey: string | null = null

  // Call every processed frame with the currently-held gesture's identity
  // (e.g. "move:up", "increase", "decrease") or null when nothing is held.
  // A changed key (including null → key, or key → a different key) fires
  // onStep immediately with isFirst=true and restarts the delay/interval;
  // an unchanged key is a no-op (the timers already running keep firing).
  update(key: string | null, onStep: (key: string, isFirst: boolean) => void): void {
    if (key === this.activeKey) return
    this.clear()
    this.activeKey = key
    if (key === null) return

    onStep(key, true)
    this.timer = setTimeout(() => {
      this.interval = setInterval(() => {
        if (this.activeKey) onStep(this.activeKey, false)
      }, HOLD_REPEAT_INTERVAL_MS)
    }, HOLD_REPEAT_DELAY_MS)
  }

  stop(): void {
    this.activeKey = null
    this.clear()
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.interval) clearInterval(this.interval)
    this.timer = null
    this.interval = null
  }
}
