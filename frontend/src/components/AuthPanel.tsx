import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { supabase, supabaseConfigured } from '@/lib/supabase'

function FloatingInput({
  label,
  type,
  value,
  onChange,
}: {
  label: string
  type: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder=" "
        className="peer w-full rounded-md border border-line bg-navy px-3 pb-1.5 pt-4 text-sm text-slate-100 outline-none transition-colors focus:border-teal-400"
      />
      <label className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 transition-all peer-focus:top-3 peer-focus:text-[10px] peer-focus:text-teal-300 peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:text-[10px]">
        {label}
      </label>
    </div>
  )
}

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
        <span className="font-data text-xs">{session.user.email}</span>
        <Button variant="ghost" onClick={() => supabase!.auth.signOut()}>
          Sign out
        </Button>
      </div>
    )
  }

  const isSignIn = mode === 'sign_in'

  return (
    <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-line bg-navy-raised shadow-lg">
      <div className="flex items-center justify-between border-b border-line bg-gradient-to-r from-teal-400/10 to-coral/10 px-5 py-3">
        <p className="font-display text-sm font-medium text-slate-100">
          {isSignIn ? 'Welcome back' : 'New here?'}
        </p>
        <button
          type="button"
          onClick={() => {
            setMode(isSignIn ? 'sign_up' : 'sign_in')
            setMessage(null)
          }}
          className="text-xs font-medium text-teal-300 underline decoration-teal-300/40 underline-offset-2 hover:decoration-teal-300"
        >
          {isSignIn ? 'Create an account' : 'Already have an account? Sign in'}
        </button>
      </div>

      <div className="flex flex-col gap-3 p-5">
        <p className="text-xs text-slate-400">
          {isSignIn ? 'Sign in to save scans to your library.' : 'Create an account to save scans to your library.'}
        </p>
        <FloatingInput label="Email" type="email" value={email} onChange={setEmail} />
        <FloatingInput label="Password" type="password" value={password} onChange={setPassword} />
        {message && <p className="text-xs text-amber-300">{message}</p>}
        <Button onClick={submit} disabled={pending || !email || !password} className="mt-1">
          {pending ? 'Working…' : isSignIn ? 'Sign in' : 'Sign up'}
        </Button>
      </div>
    </div>
  )
}
