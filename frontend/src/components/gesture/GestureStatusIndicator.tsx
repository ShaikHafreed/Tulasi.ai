import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'

// Ported from the Lovable design, wired to REAL gesture state. off /
// webcam-active / glove-linked reflect the actual persisted toggles, and
// selecting one flips them (webcam and glove are mutually exclusive here).
export type GestureMode = 'off' | 'webcam' | 'glove'

const LABELS: Record<GestureMode, { label: string; hint: string; color: string; dot: string }> = {
  off: { label: 'gesture · off', hint: 'no tracking', color: 'text-muted-foreground border-border', dot: 'bg-muted-foreground/60' },
  webcam: { label: 'webcam · active', hint: 'hand tracking', color: 'text-teal border-teal/50', dot: 'bg-teal' },
  glove: { label: 'glove · linked', hint: '6-dof · low-latency', color: 'text-coral border-coral/50', dot: 'bg-coral' },
}

export default function GestureStatusIndicator({
  mode,
  onSelect,
}: {
  mode: GestureMode
  onSelect: (mode: GestureMode) => void
}) {
  const [open, setOpen] = useState(false)
  const meta = LABELS[mode]

  function select(next: GestureMode) {
    onSelect(next)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-8 items-center gap-2 border bg-transparent px-3 font-mono text-[10px] tracking-[0.25em] uppercase transition-colors ${meta.color}`}
      >
        <span className="relative inline-flex h-1.5 w-1.5">
          {mode !== 'off' && <span className={`absolute inset-0 rounded-full ${meta.dot} animate-ping opacity-60`} />}
          <span className={`relative inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        </span>
        {meta.label}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="clay absolute right-0 top-full z-50 mt-2 w-64 p-2"
          >
            <div className="px-2 py-2 font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase">input source</div>
            {(['off', 'webcam', 'glove'] as GestureMode[]).map((m) => {
              const active = m === mode
              const info = LABELS[m]
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => select(m)}
                  className={`flex w-full items-center gap-3 px-2 py-2 text-left hover:bg-teal/5 ${active ? 'bg-teal/5' : ''}`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${info.dot}`} />
                  <div className="flex-1">
                    <div className={`font-mono text-[10px] tracking-[0.2em] uppercase ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {info.label}
                    </div>
                    <div className="mt-0.5 font-mono text-[9px] text-muted-foreground/70">{info.hint}</div>
                  </div>
                  {active && <span className="text-xs text-teal">●</span>}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
