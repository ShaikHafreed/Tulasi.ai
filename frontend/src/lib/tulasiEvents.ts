export type TulasiEventType =
  | 'scan_started'
  | 'dimensions_changed'
  | 'reference_detected'
  | 'print_check_run'
  | 'export_requested'
  | 'undo'
  | 'redo'

export interface TulasiEvent {
  type: TulasiEventType
  payload?: Record<string, unknown>
  at: number
}

const MAX_EVENTS = 30
let buffer: TulasiEvent[] = []

export function pushEvent(type: TulasiEventType, payload?: Record<string, unknown>): void {
  buffer.push({ type, payload, at: Date.now() })
  if (buffer.length > MAX_EVENTS) {
    buffer = buffer.slice(buffer.length - MAX_EVENTS)
  }
}

export function getRecentEvents(): TulasiEvent[] {
  return [...buffer]
}

export function clearEvents(): void {
  buffer = []
}
