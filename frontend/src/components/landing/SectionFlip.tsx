import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef, type ReactNode } from 'react'
import { useReducedMotion } from './useHydrated'

/**
 * Wraps a section with a subtle X-axis rotation as it enters/leaves the
 * viewport. Like turning pages of a technical binder — a few degrees, not a
 * full flip. Ported from the Lovable design.
 */
export function SectionFlip({
  children,
  id,
  className = '',
}: {
  children: ReactNode
  id?: string
  className?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })

  const rotateX = useTransform(scrollYProgress, [0, 0.35, 0.65, 1], [8, 0, 0, -6])
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.85, 1], [0.4, 1, 1, 0.75])
  const y = useTransform(scrollYProgress, [0, 0.35, 0.65, 1], [40, 0, 0, -20])

  return (
    <motion.section
      ref={ref}
      id={id}
      className={className}
      style={
        reduced
          ? undefined
          : {
              rotateX,
              opacity,
              y,
              transformPerspective: 1400,
              transformStyle: 'preserve-3d',
            }
      }
    >
      {children}
    </motion.section>
  )
}
