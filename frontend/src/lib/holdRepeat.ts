// Shared repeat timing, two modes:
//  - Default ("arrow key" mode): one immediate step when a gesture starts,
//    then — if still held past HOLD_REPEAT_DELAY_MS — a steady repeat every
//    HOLD_REPEAT_INTERVAL_MS. A deliberate pause between the first step and
//    the repeats, like holding down an arrow key.
//  - immediateRepeat mode: one immediate step, then repeats every
//    HOLD_REPEAT_INTERVAL_MS with NO initial delay gap — reads as a smooth
//    continuous change from the start rather than a stutter-then-repeat.
//    Used by resize (Part 4 gesture v3): "condition true" (past the anchor
//    deadzone) should feel steady immediately, not pause first.
// Both modes: no residual momentum after release — stopping clears every
// timer outright, nothing fires again on its own.
export const HOLD_REPEAT_DELAY_MS = 400
export const HOLD_REPEAT_INTERVAL_MS = 180

export class HoldRepeat {
  private timer: ReturnType<typeof setTimeout> | null = null
  private interval: ReturnType<typeof setInterval> | null = null
  private activeKey: string | null = null
  private readonly immediateRepeat: boolean

  constructor(options?: { immediateRepeat?: boolean }) {
    this.immediateRepeat = options?.immediateRepeat ?? false
  }

  // Call every processed frame with the currently-held gesture's identity
  // (e.g. "move", "resize_up") or null when nothing is held/the condition
  // isn't true. A changed key (including null → key, or key → a different
  // key) fires onStep immediately with isFirst=true and restarts the
  // delay/interval; an unchanged key is a no-op (the timers already running
  // keep firing).
  update(key: string | null, onStep: (key: string, isFirst: boolean) => void): void {
    if (key === this.activeKey) return
    this.clear()
    this.activeKey = key
    if (key === null) return

    onStep(key, true)
    const startInterval = () => {
      this.interval = setInterval(() => {
        if (this.activeKey) onStep(this.activeKey, false)
      }, HOLD_REPEAT_INTERVAL_MS)
    }
    if (this.immediateRepeat) {
      startInterval()
    } else {
      this.timer = setTimeout(startInterval, HOLD_REPEAT_DELAY_MS)
    }
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
