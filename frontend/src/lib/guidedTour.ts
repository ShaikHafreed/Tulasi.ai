// First-time guided-tour completion state — same one-way localStorage flag
// pattern as onboarding.ts. Shown once to brand-new users (zero scans),
// never re-triggered automatically after skip or completion; restartable
// manually from Settings.
const COMPLETED_KEY = 'tulasi_guided_tour_completed'

export function getGuidedTourCompleted(): boolean {
  return localStorage.getItem(COMPLETED_KEY) === '1'
}

export function setGuidedTourCompleted(): void {
  localStorage.setItem(COMPLETED_KEY, '1')
}
