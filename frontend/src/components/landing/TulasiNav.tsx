// Ported from the Lovable design. The "Request" CTA and sign-in link call
// back into LandingPage to open the real AuthCard dialog rather than
// scrolling to a mock form.
export function TulasiNav({
  onRequestAccess,
  onSignIn,
}: {
  onRequestAccess: () => void
  onSignIn: () => void
}) {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-border/60 bg-navy/70 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2 font-mono text-xs tracking-[0.3em] uppercase">
          <span className="inline-block h-2 w-2 bg-teal caret-blink" />
          <span className="text-foreground">tulasi</span>
          <span className="text-muted-foreground">.ai</span>
        </a>
        <div className="hidden md:flex items-center gap-8 font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          <a href="#calibration" className="hover:text-foreground transition-colors">
            calibration
          </a>
          <button type="button" onClick={onSignIn} className="uppercase hover:text-foreground transition-colors">
            sign in
          </button>
        </div>
        <button
          type="button"
          onClick={onRequestAccess}
          className="border border-teal/60 px-3 py-1.5 font-mono text-[10px] tracking-[0.3em] uppercase text-teal hover:bg-teal hover:text-navy-deep transition-colors"
        >
          Request →
        </button>
      </div>
    </nav>
  )
}
