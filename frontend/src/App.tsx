import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import LandingPage from './components/LandingPage'
import HomePage from './components/HomePage'
import { supabase } from './lib/supabase'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
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
  }, [])

  if (!checked) return null

  return session ? <HomePage session={session} /> : <LandingPage />
}

export default App
