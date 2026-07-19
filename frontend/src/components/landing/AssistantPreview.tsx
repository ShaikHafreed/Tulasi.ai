import { motion } from 'framer-motion'

// Ported from the Lovable design. A scripted assistant transcript preview —
// illustrative marketing content, not the live assistant.
type Turn = {
  from: 'you' | 'tulasi' | 'action'
  text?: string
}

const turns: Turn[] = [
  { from: 'you', text: 'Make the handle 15% thicker for a firmer grip.' },
  { from: 'tulasi', text: 'Thickening handle radius 9.0 → 10.4 mm. Wall thickness stays ≥ 3.0mm — safe for ceramic firing.' },
  { from: 'you', text: 'And drop the base to 96 mm so it stacks with the other mug.' },
  { from: 'tulasi', text: 'Height 108 → 96 mm. Rim ellipse preserved. Volume drops from 340ml → 302ml — okay?' },
  { from: 'action' },
]

export function AssistantPreview() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-32 md:py-48">
      <div className="max-w-2xl mx-auto text-center">
        <div className="font-mono text-[10px] tracking-[0.3em] text-teal uppercase">06 · assistant</div>
        <h2 className="mt-4 font-display text-3xl md:text-5xl leading-tight">
          Speak in intent. <br />
          <span className="italic text-muted-foreground">It edits the geometry.</span>
        </h2>
      </div>

      <div className="mt-16 mx-auto max-w-2xl border border-border bg-navy-deep/60 corner-ticks">
        <div className="border-b border-border px-5 py-3 flex items-center justify-between font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 bg-teal caret-blink" />
            session · mug_01.tul
          </span>
          <span>agent · fit_true</span>
        </div>

        <div className="p-5 md:p-6 space-y-4">
          {turns.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.18, ease: [0.22, 1, 0.36, 1] }}
              viewport={{ once: true, margin: '-10%' }}
              className={t.from === 'you' ? 'flex justify-end' : t.from === 'action' ? 'pt-2' : 'flex justify-start'}
            >
              {t.from === 'you' && (
                <div className="max-w-[80%] border border-border bg-muted/40 px-4 py-3 text-sm">{t.text}</div>
              )}
              {t.from === 'tulasi' && (
                <div className="max-w-[85%] border border-teal/30 bg-teal/5 px-4 py-3 text-sm">
                  <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-teal mb-1.5">tulasi</div>
                  {t.text}
                </div>
              )}
              {t.from === 'action' && (
                <div className="border border-coral/50 bg-coral/5 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-coral">proposed action</div>
                      <div className="mt-1 font-display text-lg">Apply 2 geometry changes</div>
                      <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
                        <li>· handle radius 9.0 → 10.4 mm</li>
                        <li>· height 108.0 → 96.0 mm</li>
                      </ul>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button className="border border-coral bg-coral text-navy-deep px-4 py-2 font-mono text-[10px] tracking-[0.2em] uppercase hover:brightness-110">
                        Confirm
                      </button>
                      <button className="border border-border px-4 py-2 font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground">
                        Undo
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center gap-3 font-mono text-xs">
          <span className="text-teal">›</span>
          <span className="text-muted-foreground">Ask Tulasi to edit…</span>
          <span className="ml-auto text-teal caret-blink">▍</span>
        </div>
      </div>
    </div>
  )
}
