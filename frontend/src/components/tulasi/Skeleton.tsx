// Warm skeleton primitives — shape-matched to the real content they stand
// in for, not a generic pulse block. Used for genuinely-loading real async
// state (scan list fetch, model resolving), never to fake instant data.

export function SkeletonLine({ w = '100%', h = 12 }: { w?: string | number; h?: number }) {
  return <div className="skel" style={{ width: w, height: h }} />
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`skel ${className}`} />
}

export function SkeletonCard() {
  return (
    <article className="clay overflow-hidden">
      <div className="skel aspect-[4/3] rounded-none" />
      <div className="space-y-3 border-t border-border/50 p-4">
        <div className="flex items-center justify-between">
          <SkeletonLine w="55%" h={14} />
          <SkeletonLine w={32} h={10} />
        </div>
        <SkeletonLine w="35%" h={10} />
        <div className="grid grid-cols-3 gap-2 pt-1">
          <SkeletonLine h={10} />
          <SkeletonLine h={10} />
          <SkeletonLine h={10} />
        </div>
      </div>
    </article>
  )
}

export function SkeletonListRow() {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-6 border-b border-border/50 px-5 py-4 last:border-0">
      <div className="space-y-2">
        <SkeletonLine w="45%" h={14} />
        <SkeletonLine w="20%" h={10} />
      </div>
      <SkeletonLine w={120} h={10} />
      <SkeletonLine w={70} h={10} />
    </div>
  )
}

export function SkeletonModelViewer() {
  return (
    <div className="clay relative aspect-[4/3] overflow-hidden">
      <div className="skel absolute inset-0 rounded-none" />
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 400 400" className="h-40 w-40 opacity-30">
          <g stroke="var(--color-teal)" strokeWidth="1.4" strokeDasharray="4 6" fill="none">
            <ellipse cx="200" cy="130" rx="70" ry="16" />
            <path d="M 130 130 L 128 300 Q 128 320 148 322 L 252 322 Q 272 320 272 300 L 270 130" />
            <path d="M 272 165 Q 320 175 320 220 Q 320 265 272 275" />
          </g>
        </svg>
      </div>
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">resolving…</span>
        <span className="caret-blink font-mono text-[10px] uppercase tracking-[0.25em] text-teal">●</span>
      </div>
    </div>
  )
}
