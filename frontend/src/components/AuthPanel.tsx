import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { supabase, supabaseConfigured } from '@/lib/supabase'

export default function AuthPanel({ session }: { session: Session | null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!supabaseConfigured || !supabase) {
    return null
  }

  async function submit() {
    setPending(true)
    setMessage(null)
    const { error } =
      mode === 'sign_in'
        ? await supabase!.auth.signInWithPassword({ email, password })
        : await supabase!.auth.signUp({ email, password })
    setPending(false)
    if (error) {
      setMessage(error.message)
    } else if (mode === 'sign_up') {
      setMessage('Check your email to confirm your account.')
    }
  }

  if (session) {
    return (
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <span>Signed in as {session.user.email}</span>
        <Button variant="ghost" onClick={() => supabase!.auth.signOut()}>
          Sign out
        </Button>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-sm text-slate-300">
        {mode === 'sign_in' ? 'Sign in to save scans to your library' : 'Create an account to save scans'}
      </p>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
      />
      {message && <p className="text-xs text-amber-300">{message}</p>}
      <div className="flex items-center justify-between">
        <Button onClick={submit} disabled={pending || !email || !password}>
          {mode === 'sign_in' ? 'Sign in' : 'Sign up'}
        </Button>
        <button
          type="button"
          className="text-xs text-teal-300 underline"
          onClick={() => setMode((m) => (m === 'sign_in' ? 'sign_up' : 'sign_in'))}
        >
          {mode === 'sign_in' ? 'Need an account?' : 'Have an account?'}
        </button>
      </div>
    </div>
  )
}
