import { useEffect, useState } from 'react'
import AuthCard from './AuthCard'
import { SmoothScroll } from './landing/SmoothScroll'
import { TulasiNav } from './landing/TulasiNav'
import { SketchToModelHero } from './landing/SketchToModelHero'
import { SectionFlip } from './landing/SectionFlip'
import { ComparisonSplit } from './landing/ComparisonSplit'
import { CalibrationDemo } from './landing/CalibrationDemo'
import { FeatureReveal } from './landing/FeatureReveal'
import { GestureCue } from './landing/GestureCue'
import { AssistantPreview } from './landing/AssistantPreview'
import { ClosingCTA } from './landing/ClosingCTA'

// Landing page ported from the Lovable design. Scroll-driven sketch→model
// hero, then a sequence of framed technical sections. The real Supabase
// AuthCard is owned here and opened by the Request-access / Sign-in CTAs —
// no mock form, no separate auth surface.
export default function LandingPage() {
  const [authMode, setAuthMode] = useState<'sign_in' | 'sign_up' | null>(null)

  // The ported design is dark-first with no theme toggle. If the user was in
  // light mode inside the app then signed out, drop the leftover `.light`
  // class so the landing's dark panels render correctly.
  useEffect(() => {
    document.documentElement.classList.remove('light')
  }, [])

  const requestAccess = () => setAuthMode('sign_up')

  return (
    <div id="top" className="relative min-h-screen">
      <SmoothScroll />
      <TulasiNav onRequestAccess={requestAccess} onSignIn={() => setAuthMode('sign_in')} />

      <main>
        <SketchToModelHero onRequestAccess={requestAccess} />

        <SectionFlip>
          <ComparisonSplit />
        </SectionFlip>

        <SectionFlip>
          <CalibrationDemo />
        </SectionFlip>

        <SectionFlip>
          <FeatureReveal />
        </SectionFlip>

        <SectionFlip>
          <GestureCue />
        </SectionFlip>

        <SectionFlip>
          <AssistantPreview />
        </SectionFlip>

        <SectionFlip>
          <ClosingCTA onRequestAccess={requestAccess} />
        </SectionFlip>
      </main>

      <AuthCard mode={authMode} onOpenChange={(open) => !open && setAuthMode(null)} />
    </div>
  )
}
