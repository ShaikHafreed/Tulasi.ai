import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import LandingPage from './components/LandingPage'
import HomePage from './components/HomePage'
import SharePage from './components/SharePage'
import { supabase } from './lib/supabase'

const SHARE_PREFIX = '/share/'

function App() {
  const isShare = window.location.pathname.startsWith(SHARE_PREFIX)
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    // The public share page needs no auth — skip the session check entirely.
    if (isShare) return
    if (!supabase) {
      setChecked(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecked(true)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => subscription.subscription.unsubscribe()
  }, [isShare])

  if (isShare) {
    return <SharePage slug={decodeURIComponent(window.location.pathname.slice(SHARE_PREFIX.length))} />
  }

  if (!checked) return null

  return session ? <HomePage session={session} /> : <LandingPage />
}

export default App
