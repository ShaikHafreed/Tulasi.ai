import { useEffect, useState } from 'react'

const QUERY = '(max-width: 640px)'

// Webcam hand tracking needs a stable, front-facing camera view and real
// screen space for the debug/preview overlay — not viable on a phone held
// one-handed. Used to disable (not silently hide) the webcam gesture option
// on small screens, with an honest reason shown.
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(QUERY).matches))
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    setMobile(mq.matches)
    const onChange = () => setMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}
