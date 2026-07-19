import { useEffect, useState } from 'react'

// Ported from the Lovable design. The r3f canvases only mount after
// hydration so SSR/first paint shows the static SVG fallback instead.
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}
