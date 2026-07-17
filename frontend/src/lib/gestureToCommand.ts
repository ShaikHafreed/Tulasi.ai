import { executeCommand, isCommandAvailable } from './tulasiCommands'
import type { GestureEvent } from './webcamGesture'

export interface CurrentDimensions {
  width_mm: number
  height_mm: number
  depth_mm: number
}

const ROTATE_DEGREES_PER_UNIT = 25
const RESIZE_MM_PER_UNIT = 15
const MIN_DIMENSION_MM = 1

// Shared by both gesture tracks (webcam today, the BLE glove later) —
// whichever input produces a GestureEvent, it goes through the exact same
// whitelisted command path the AI assistant uses. No gesture track is
// allowed to touch app state directly.
export function applyGestureEvent(event: GestureEvent, getDimensions: () => CurrentDimensions | null): void {
  switch (event.gesture) {
    case 'rotate': {
      if (!isCommandAvailable('rotateView')) return
      const degrees = event.signedDelta ?? event.magnitude * ROTATE_DEGREES_PER_UNIT
      executeCommand('rotateView', { axis: 'y', degrees })
      return
    }
    case 'move': {
      if (!isCommandAvailable('panView') || !event.direction) return
      executeCommand('panView', { direction: event.direction, magnitude: event.magnitude })
      return
    }
    case 'resize_up':
    case 'resize_down': {
      if (!isCommandAvailable('setDimensions')) return
      const dims = getDimensions()
      if (!dims) return
      const largest = Math.max(dims.width_mm, dims.height_mm, dims.depth_mm, 1)
      const deltaMm = RESIZE_MM_PER_UNIT * event.magnitude * (event.gesture === 'resize_up' ? 1 : -1)
      const scaleFactor = Math.max(1 + deltaMm / largest, 0.05)
      executeCommand('setDimensions', {
        width_mm: Math.max(dims.width_mm * scaleFactor, MIN_DIMENSION_MM),
        height_mm: Math.max(dims.height_mm * scaleFactor, MIN_DIMENSION_MM),
        depth_mm: Math.max(dims.depth_mm * scaleFactor, MIN_DIMENSION_MM),
      })
    }
  }
}
