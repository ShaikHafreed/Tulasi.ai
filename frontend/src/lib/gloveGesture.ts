import type { GestureEvent, GestureType } from './webcamGesture'

// Must match firmware/src/config.h exactly.
const GESTURE_SERVICE_UUID = '6d7a9f10-2c3b-4e5a-8f21-9b0c1d2e3f40'
const GESTURE_CHAR_UUID = '6d7a9f11-2c3b-4e5a-8f21-9b0c1d2e3f40'

// Enum encodings shared with the firmware's BLE payload.
const GESTURE_BY_CODE: Record<number, GestureType> = {
  0: 'rotate',
  1: 'move',
  2: 'resize_up',
  3: 'resize_down',
}
const DIRECTION_BY_CODE: Record<number, GestureEvent['direction']> = {
  1: 'up',
  2: 'down',
  3: 'left',
  4: 'right',
}

export type GloveStatus = 'idle' | 'connecting' | 'connected' | 'unsupported' | 'error'

export interface GloveGestureHandlers {
  onGesture: (event: GestureEvent) => void
  onStatus: (status: GloveStatus, detail?: string) => void
}

// Web Bluetooth is Chrome/Edge only — not Firefox or Safari. Callers should
// surface this rather than letting a connect click fail silently.
export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

// Parses the firmware's 14-byte little-endian payload into the same
// GestureEvent shape the webcam track emits, so both feed gestureToCommand.ts
// unchanged. Layout: gesture:u8, direction:u8, magnitude:f32, signedDelta:f32,
// timestamp:u32.
function parsePayload(view: DataView): GestureEvent | null {
  if (view.byteLength < 14) return null
  const gesture = GESTURE_BY_CODE[view.getUint8(0)]
  if (!gesture) return null
  return {
    gesture,
    direction: DIRECTION_BY_CODE[view.getUint8(1)],
    magnitude: view.getFloat32(2, true),
    signedDelta: view.getFloat32(6, true),
    timestamp: view.getUint32(10, true),
  }
}

// Connects the browser (Web Bluetooth client) to the ESP32's gesture GATT
// service and streams notifications through onGesture. One instance per
// connection; call disconnect() to tear it down.
export class GloveGestureConnection {
  private handlers: GloveGestureHandlers
  private device: BluetoothDevice | null = null
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null
  private boundValueChanged = (event: Event) => this.onValueChanged(event)
  private boundDisconnected = () => this.handlers.onStatus('idle', 'Glove disconnected')

  constructor(handlers: GloveGestureHandlers) {
    this.handlers = handlers
  }

  async connect(): Promise<void> {
    if (!isWebBluetoothSupported()) {
      this.handlers.onStatus('unsupported', 'Gesture glove needs Chrome or Edge.')
      return
    }

    try {
      this.handlers.onStatus('connecting')
      // requestDevice MUST be called from a user gesture (a click) — the
      // panel's Connect button is that gesture.
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [GESTURE_SERVICE_UUID] }],
      })
      this.device.addEventListener('gattserverdisconnected', this.boundDisconnected)

      const server = await this.device.gatt!.connect()
      const service = await server.getPrimaryService(GESTURE_SERVICE_UUID)
      this.characteristic = await service.getCharacteristic(GESTURE_CHAR_UUID)
      await this.characteristic.startNotifications()
      this.characteristic.addEventListener('characteristicvaluechanged', this.boundValueChanged)

      this.handlers.onStatus('connected')
    } catch (err) {
      // A user cancelling the device chooser throws NotFoundError — treat that
      // as a quiet return to idle, not an error banner.
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        this.handlers.onStatus('idle')
        return
      }
      this.handlers.onStatus('error', err instanceof Error ? err.message : 'Could not connect to the glove.')
    }
  }

  async disconnect(): Promise<void> {
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.boundValueChanged)
    if (this.characteristic) {
      try {
        await this.characteristic.stopNotifications()
      } catch {
        // Device may already be gone — ignore.
      }
    }
    this.device?.removeEventListener('gattserverdisconnected', this.boundDisconnected)
    this.device?.gatt?.disconnect()
    this.characteristic = null
    this.device = null
    this.handlers.onStatus('idle')
  }

  private onValueChanged(event: Event): void {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value
    if (!value) return
    const parsed = parsePayload(value)
    if (parsed) this.handlers.onGesture(parsed)
  }
}
