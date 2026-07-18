import { useEffect, useRef, useState } from 'react'
import { Bluetooth, BluetoothConnected, BluetoothOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GloveGestureConnection, type GloveStatus } from '@/lib/gloveGesture'
import type { GestureEvent } from '@/lib/webcamGesture'
import { applyGestureEvent, type CurrentDimensions } from '@/lib/gestureToCommand'

const GESTURE_LABELS: Record<GestureEvent['gesture'], string> = {
  rotate: 'Rotate',
  move: 'Move',
  resize_up: 'Resize +',
  resize_down: 'Resize −',
}

const ACTIVITY_FLASH_MS = 700

export default function GloveGesturePanel({
  enabled,
  getDimensions,
  raised = false,
}: {
  enabled: boolean
  getDimensions: () => CurrentDimensions | null
  // Lifted above the webcam panel when both are on, since both pin to the
  // bottom-left corner.
  raised?: boolean
}) {
  const connectionRef = useRef<GloveGestureConnection | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [status, setStatus] = useState<GloveStatus>('idle')
  const [detail, setDetail] = useState<string | null>(null)
  const [lastGesture, setLastGesture] = useState<string | null>(null)

  useEffect(() => {
    const connection = new GloveGestureConnection({
      onStatus: (next, message) => {
        setStatus(next)
        setDetail(message ?? null)
      },
      onGesture: (event) => {
        applyGestureEvent(event, getDimensions)
        // Dev-only: confirms events arrive and are mapped correctly.
        console.debug('[glove]', event.gesture, event)
        setLastGesture(GESTURE_LABELS[event.gesture])
        if (flashTimer.current) clearTimeout(flashTimer.current)
        flashTimer.current = setTimeout(() => setLastGesture(null), ACTIVITY_FLASH_MS)
      },
    })
    connectionRef.current = connection

    return () => {
      void connection.disconnect()
      connectionRef.current = null
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
    // getDimensions is a stable ref-reader from the parent; connection is
    // created once for the lifetime of the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!enabled) return null

  const isConnected = status === 'connected'

  return (
    <div
      className={cn(
        'fixed left-4 z-50 w-[240px] overflow-hidden rounded-lg border border-border bg-card/95 shadow-lg backdrop-blur',
        raised ? 'bottom-[420px]' : 'bottom-4',
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isConnected ? (
            <BluetoothConnected size={13} className="text-primary" />
          ) : status === 'unsupported' ? (
            <BluetoothOff size={13} />
          ) : (
            <Bluetooth size={13} />
          )}
          Gesture glove
        </div>
        {lastGesture && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {lastGesture}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 px-3 py-3">
        <p className="text-[11px] text-muted-foreground">
          {status === 'idle' && 'Not connected.'}
          {status === 'connecting' && 'Connecting…'}
          {status === 'connected' && (
            <span className="flex items-center gap-1.5 text-primary">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              Connected — sending gestures live.
            </span>
          )}
          {status === 'unsupported' && (detail ?? 'Gesture glove needs Chrome or Edge.')}
          {status === 'error' && (detail ?? 'Connection failed.')}
        </p>

        {status === 'unsupported' ? null : isConnected ? (
          <button
            type="button"
            onClick={() => void connectionRef.current?.disconnect()}
            className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void connectionRef.current?.connect()}
            disabled={status === 'connecting'}
            className="rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
          >
            {status === 'connecting' ? 'Connecting…' : 'Connect glove'}
          </button>
        )}
      </div>
    </div>
  )
}
