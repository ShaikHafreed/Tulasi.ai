export type TulasiEventType =
  | 'scan_started'
  | 'dimensions_changed'
  | 'reference_detected'
  | 'print_check_run'
  | 'export_requested'
  | 'undo'
  | 'redo'
  | 'live_mode_enabled'
  | 'live_mode_disabled'

export interface TulasiEvent {
  type: TulasiEventType
  payload?: Record<string, unknown>
  at: number
}

const MAX_EVENTS = 30
let buffer: TulasiEvent[] = []
const listeners = new Set<(event: TulasiEvent) => void>()

export function pushEvent(type: TulasiEventType, payload?: Record<string, unknown>): void {
  const event: TulasiEvent = { type, payload, at: Date.now() }
  buffer.push(event)
  if (buffer.length > MAX_EVENTS) {
    buffer = buffer.slice(buffer.length - MAX_EVENTS)
  }
  for (const listener of listeners) listener(event)
}

export function getRecentEvents(): TulasiEvent[] {
  return [...buffer]
}

export function clearEvents(): void {
  buffer = []
}

// Live mode subscribes here to react to events as they happen, instead of
// only seeing them the next time the user sends a chat message.
export function onEvent(listener: (event: TulasiEvent) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
