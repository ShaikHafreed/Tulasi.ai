import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthCard({
  mode: initialMode,
  onClose,
}: {
  mode: 'sign_in' | 'sign_up'
  onClose: () => void
}) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const isSignIn = mode === 'sign_in'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) {
      setMessage('Auth is not configured yet.')
      return
    }
    setPending(true)
    setMessage(null)
    const { error } = isSignIn
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    setPending(false)
    if (error) {
      setMessage(error.message)
    } else if (isSignIn) {
      onClose()
    } else {
      setMessage('Check your email to confirm your account.')
    }
  }

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-card" onClick={(event) => event.stopPropagation()}>
        <button className="auth-close" type="button" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="auth-visual">
          <div className="brand">
            <span className="dot" />
            TULASI.AI
          </div>
          <p>Calibrated, not guessed.</p>
        </div>

        <div className="auth-content">
          <h2>{isSignIn ? 'Sign in' : 'Create an account'}</h2>

          <form className="auth-form" onSubmit={submit}>
            <div className="textbox">
              <input
                type="email"
                required
                placeholder=" "
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
              <label>Email</label>
            </div>
            <div className="textbox">
              <input
                type="password"
                required
                placeholder=" "
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isSignIn ? 'current-password' : 'new-password'}
              />
              <label>Password</label>
            </div>

            {message && <p className="auth-message">{message}</p>}

            <button className="auth-submit" type="submit" disabled={pending}>
              <span>{pending ? 'Working…' : 'Continue'}</span>
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <p className="auth-switch">
            {isSignIn ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => {
                setMode(isSignIn ? 'sign_up' : 'sign_in')
                setMessage(null)
              }}
            >
              {isSignIn ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
