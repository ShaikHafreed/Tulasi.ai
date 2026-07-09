import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.95 10.7a5.4 5.4 0 0 1 0-3.4V4.97H.95a9 9 0 0 0 0 8.06l3-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

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
  const [oauthPending, setOauthPending] = useState<'google' | 'github' | null>(null)
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

  async function continueWithOAuth(provider: 'google' | 'github') {
    if (!supabase) {
      setMessage('Auth is not configured yet.')
      return
    }
    setOauthPending(provider)
    setMessage(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setMessage(error.message)
      setOauthPending(null)
    }
    // On success the browser navigates away to the provider, so there's
    // nothing further to do here — it lands back on this origin signed in.
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

          <div className="oauth-row">
            <button
              type="button"
              className="oauth-btn"
              onClick={() => continueWithOAuth('google')}
              disabled={oauthPending !== null}
            >
              <GoogleIcon />
              {oauthPending === 'google' ? 'Redirecting…' : 'Continue with Google'}
            </button>
            <button
              type="button"
              className="oauth-btn"
              onClick={() => continueWithOAuth('github')}
              disabled={oauthPending !== null}
            >
              <GitHubIcon />
              {oauthPending === 'github' ? 'Redirecting…' : 'Continue with GitHub'}
            </button>
          </div>

          <div className="auth-divider">
            <span>or continue with email</span>
          </div>

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
