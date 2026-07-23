const STORAGE_KEY = 'tulasi_auto_apply_reversible'

// Reversible assistant actions (resize, rotate, pan) auto-run by default —
// this lets a user opt into confirming even those, same on/off shape as
// voicePreference.ts. Default ON preserves today's existing behavior.
export function getAutoApplyReversible(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === null ? true : stored === '1'
}

export function setAutoApplyReversible(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
}
