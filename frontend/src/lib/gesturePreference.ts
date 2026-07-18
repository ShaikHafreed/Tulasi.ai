const STORAGE_KEY = 'tulasi_gesture_webcam_enabled'
const GLOVE_KEY = 'tulasi_gesture_glove_enabled'
const CAMERA_DEVICE_KEY = 'tulasi_gesture_camera_device_id'

// Webcam gesture control defaults OFF — explicit opt-in only, matches voicePreference.ts.
export function getWebcamGestureEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1'
}

export function setWebcamGestureEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
}

// Physical-glove (Track 2) gesture control — also defaults OFF, experimental.
export function getGloveGestureEnabled(): boolean {
  return localStorage.getItem(GLOVE_KEY) === '1'
}

export function setGloveGestureEnabled(enabled: boolean): void {
  localStorage.setItem(GLOVE_KEY, enabled ? '1' : '0')
}

// Without this, getUserMedia just takes whatever the OS/browser considers
// the default camera — on a machine with a phone linked as a virtual
// camera (Windows Phone Link, etc.), that's often the phone instead of the
// laptop's own built-in webcam. Remembered per-browser so it doesn't need
// re-picking every session.
export function getPreferredCameraDeviceId(): string | null {
  return localStorage.getItem(CAMERA_DEVICE_KEY)
}

export function setPreferredCameraDeviceId(deviceId: string | null): void {
  if (deviceId) localStorage.setItem(CAMERA_DEVICE_KEY, deviceId)
  else localStorage.removeItem(CAMERA_DEVICE_KEY)
}
