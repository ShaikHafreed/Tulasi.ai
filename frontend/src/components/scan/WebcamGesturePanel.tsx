import { useEffect, useRef, useState } from 'react'
import { Hand, VideoOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WebcamGestureTracker, type GestureDebugInfo, type GestureEvent, type TrackedPoint } from '@/lib/webcamGesture'
import { applyGestureEvent, type CurrentDimensions } from '@/lib/gestureToCommand'
import { getPreferredCameraDeviceId, setPreferredCameraDeviceId } from '@/lib/gesturePreference'

// 2x the original 200x150 — was too small to actually see hand tracking by
// eye. Matches the camera's ideal capture resolution below 1:1 so it isn't
// upscaled/blurry.
const OVERLAY_WIDTH = 400
const OVERLAY_HEIGHT = 300
const GESTURE_FLASH_MS = 700

// MediaPipe Hands connections for the debug overlay — thumb, each finger,
// and the palm base. Not exhaustive, just enough to read the hand shape.
const CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

const GESTURE_LABELS: Record<GestureEvent['gesture'], string> = {
  rotate: 'Rotate',
  move: 'Move',
  resize_up: 'Resize +',
  resize_down: 'Resize −',
}

type Status = 'idle' | 'starting' | 'loading-model' | 'active' | 'unsupported' | 'error'

function cameraConstraints(deviceId: string | null): MediaStreamConstraints {
  // A linked-phone virtual camera (Windows Phone Link, etc.) can otherwise
  // win as the OS/browser's "default" camera ahead of a laptop's own
  // built-in webcam — combining an exact deviceId with facingMode risks an
  // OverconstrainedError on some devices, so drop facingMode once a
  // specific device is picked.
  return deviceId
    ? { video: { deviceId: { exact: deviceId }, width: { ideal: OVERLAY_WIDTH }, height: { ideal: OVERLAY_HEIGHT } }, audio: false }
    : { video: { width: { ideal: OVERLAY_WIDTH }, height: { ideal: OVERLAY_HEIGHT }, facingMode: 'user' }, audio: false }
}

// "Device busy" (NotReadableError) is usually transient — most often our own
// effect re-running under React StrictMode's dev-only double-mount, which
// requests the camera, tears it down, then immediately requests it again
// before the OS driver has released it. A short wait-and-retry absorbs that
// instead of surfacing a scary permanent-looking error for a race condition.
// Defense in depth alongside webcamGesture.ts's own error normalization —
// whatever ends up here, never hand a raw object to String() and let
// "[object Event]"/"[object Object]" reach the user.
function describeError(err: unknown): string {
  if (err instanceof DOMException) return `${err.name}: ${err.message}`
  if (err instanceof Error) return err.message
  if (err instanceof Event) return `${err.type} error while accessing the camera.`
  return 'Webcam unavailable.'
}

async function acquireCamera(signal: { cancelled: boolean }, deviceId: string | null): Promise<MediaStream> {
  const constraints = cameraConstraints(deviceId)
  try {
    return await navigator.mediaDevices.getUserMedia(constraints)
  } catch (err) {
    if (signal.cancelled || !(err instanceof DOMException) || err.name !== 'NotReadableError') throw err
    await new Promise((resolve) => setTimeout(resolve, 400))
    if (signal.cancelled) throw err
    return navigator.mediaDevices.getUserMedia(constraints)
  }
}

export default function WebcamGesturePanel({
  enabled,
  getDimensions,
}: {
  enabled: boolean
  getDimensions: () => CurrentDimensions | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trackerRef = useRef<WebcamGestureTracker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastGesture, setLastGesture] = useState<string | null>(null)
  const [handVisible, setHandVisible] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(getPreferredCameraDeviceId)
  const [debugInfo, setDebugInfo] = useState<GestureDebugInfo | null>(null)

  // Populate the camera picker whenever the panel is on — labels only come
  // through once permission has been granted at least once, and refresh on
  // devicechange so plugging in a webcam later shows up without a reload.
  useEffect(() => {
    if (!enabled || !navigator.mediaDevices?.enumerateDevices) return
    let cancelled = false

    function refresh() {
      navigator.mediaDevices.enumerateDevices().then((all) => {
        if (!cancelled) setDevices(all.filter((d) => d.kind === 'videoinput'))
      })
    }

    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener('devicechange', refresh)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return
    }

    const signal = { cancelled: false }
    setStatus('starting')

    acquireCamera(signal, selectedDeviceId)
      .then(async (stream) => {
        if (signal.cancelled || !videoRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        videoRef.current.srcObject = stream
        await videoRef.current.play()

        const tracker = new WebcamGestureTracker(videoRef.current, {
          onFrame: (landmarks) => {
            setHandVisible(!!landmarks)
            drawOverlay(canvasRef.current, videoRef.current, landmarks)
          },
          onDebug: setDebugInfo,
          onGesture: (event) => {
            applyGestureEvent(event, getDimensions)
            // Dev-only: makes miscalibration easy to diagnose during tuning.
            console.debug('[gesture]', event.gesture, event)
            setLastGesture(GESTURE_LABELS[event.gesture])
            if (flashTimer.current) clearTimeout(flashTimer.current)
            flashTimer.current = setTimeout(() => setLastGesture(null), GESTURE_FLASH_MS)
          },
        })
        trackerRef.current = tracker
        // Separate status for this step — it fetches the hand-tracking
        // model over the network (a few MB from a CDN), which can take much
        // longer than opening the camera and fails differently (network/
        // firewall issues, not a permissions problem).
        setStatus('loading-model')
        await tracker.start()
        if (!signal.cancelled) setStatus('active')
      })
      .catch((err) => {
        if (signal.cancelled) return
        setStatus('error')
        setErrorMessage(describeError(err))
      })

    return () => {
      signal.cancelled = true
      trackerRef.current?.stop()
      trackerRef.current = null
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, retryNonce, selectedDeviceId])

  if (!enabled) return null

  return (
    <div className="fixed bottom-4 left-4 z-50 w-fit overflow-hidden rounded-lg border border-border bg-card/95 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Hand size={13} className={cn(handVisible && 'text-primary')} />
          Gesture control
        </div>
        {lastGesture && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {lastGesture}
          </span>
        )}
      </div>

      {devices.length > 1 && (
        <select
          value={selectedDeviceId ?? ''}
          onChange={(event) => {
            const next = event.target.value || null
            setSelectedDeviceId(next)
            setPreferredCameraDeviceId(next)
          }}
          className="w-full border-b border-border bg-transparent px-2.5 py-1 text-[10px] text-muted-foreground"
        >
          <option value="">System default</option>
          {devices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Camera ${index + 1}`}
            </option>
          ))}
        </select>
      )}

      <div className="relative" style={{ width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT }}>
        <video ref={videoRef} className="hidden" muted playsInline />
        <canvas ref={canvasRef} width={OVERLAY_WIDTH} height={OVERLAY_HEIGHT} className="block" />

        {status !== 'active' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/90 px-3 text-center">
            <VideoOff size={16} className="text-muted-foreground" />
            <p className="text-[11px] text-muted-foreground">
              {status === 'starting' && 'Starting camera…'}
              {status === 'loading-model' && 'Loading hand-tracking model…'}
              {status === 'unsupported' && 'This browser has no webcam API.'}
              {status === 'error' && (errorMessage ?? 'Webcam unavailable.')}
              {status === 'idle' && 'Waiting…'}
            </p>
            {status === 'error' && (
              <button
                type="button"
                onClick={() => setRetryNonce((n) => n + 1)}
                className="rounded border border-border px-2 py-0.5 text-[10px] text-foreground transition-colors hover:bg-card"
              >
                Try again
              </button>
            )}
          </div>
        )}
        {status === 'active' && !handVisible && (
          <div className="absolute inset-x-0 bottom-0 bg-background/80 px-2 py-1 text-center text-[10px] text-muted-foreground">
            No hand detected
          </div>
        )}
      </div>

      {status === 'active' && (
        <div className="grid grid-cols-3 gap-1 border-t border-border px-2.5 py-1.5 text-center text-[10px] text-muted-foreground">
          <span>pinch {debugInfo ? debugInfo.pinch.toFixed(3) : '—'}</span>
          <span>move {debugInfo ? debugInfo.moveDist.toFixed(3) : '—'}</span>
          <span>tilt {debugInfo ? debugInfo.rotateDeltaDeg.toFixed(0) : '—'}°</span>
        </div>
      )}
    </div>
  )
}

function drawOverlay(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement | null,
  landmarks: TrackedPoint[] | null,
): void {
  if (!canvas || !video) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.save()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  // Mirror horizontally so the preview matches the user's own movement,
  // like looking in a mirror rather than watching themselves from behind.
  ctx.translate(canvas.width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  if (landmarks) {
    ctx.strokeStyle = '#2dd4bf'
    ctx.lineWidth = 1.5
    for (const [a, b] of CONNECTIONS) {
      const pa = landmarks[a]
      const pb = landmarks[b]
      if (!pa || !pb) continue
      ctx.beginPath()
      ctx.moveTo(pa.x * canvas.width, pa.y * canvas.height)
      ctx.lineTo(pb.x * canvas.width, pb.y * canvas.height)
      ctx.stroke()
    }
    ctx.fillStyle = '#ff7a50'
    for (const point of landmarks) {
      ctx.beginPath()
      ctx.arc(point.x * canvas.width, point.y * canvas.height, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.restore()
}
