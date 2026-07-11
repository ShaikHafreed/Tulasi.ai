const STORAGE_KEY = 'tulasi_voice_enabled'

// Stage C voice replies default OFF — explicit opt-in only.
export function getVoiceEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1'
}

export function setVoiceEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
}
