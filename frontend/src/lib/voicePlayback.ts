import { speakText } from './api'

// Browsers commonly block audio that isn't the direct result of a user
// gesture (a click) — an `await` in between counts as "not direct" in some
// engines, so auto-play after a fetch can fail silently. Exporting this so
// both the auto-play attempt (ChatPanel) and a manual "listen" button
// (MessageBubble) share one implementation.
export async function playSpokenText(text: string): Promise<void> {
  const blob = await speakText(text)
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.addEventListener('ended', () => URL.revokeObjectURL(url))
  await audio.play()
}
