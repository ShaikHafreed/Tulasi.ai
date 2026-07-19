import { useEffect, useState } from 'react'

// First-run checklist state. "Uploaded" comes from real scan data (passed in);
// "gesture" and "exported" are client actions tracked as one-way localStorage
// flags — set the first time the user genuinely does each, never faked.

const DISMISS_KEY = 'tulasi_onboarding_dismissed'
const GESTURE_KEY = 'tulasi_onboarding_gesture_tried'
const EXPORT_KEY = 'tulasi_onboarding_exported'
const CHANGE_EVENT = 'tulasi-onboarding-change'

function read(key: string): boolean {
  return localStorage.getItem(key) === '1'
}

function write(key: string): void {
  localStorage.setItem(key, '1')
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function markGestureTried(): void {
  if (!read(GESTURE_KEY)) write(GESTURE_KEY)
}

export function markExported(): void {
  if (!read(EXPORT_KEY)) write(EXPORT_KEY)
}

export function dismissOnboarding(): void {
  write(DISMISS_KEY)
}

export interface OnboardingState {
  uploaded: boolean
  gesture: boolean
  exported: boolean
  dismissed: boolean
  allDone: boolean
}

export function useOnboarding(hasScans: boolean): OnboardingState {
  const [, setTick] = useState(0)
  useEffect(() => {
    const onChange = () => setTick((t) => t + 1)
    window.addEventListener(CHANGE_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  const gesture = read(GESTURE_KEY)
  const exported = read(EXPORT_KEY)
  const dismissed = read(DISMISS_KEY)
  return { uploaded: hasScans, gesture, exported, dismissed, allDone: hasScans && gesture && exported }
}
