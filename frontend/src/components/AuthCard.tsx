import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase'

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
  onOpenChange,
}: {
  mode: 'sign_in' | 'sign_up' | null
  onOpenChange: (open: boolean) => void
}) {
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [oauthPending, setOauthPending] = useState<'google' | 'github' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode)
      setMessage(null)
      setEmail('')
      setPassword('')
    }
  }, [initialMode])

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
      onOpenChange(false)
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
  }

  return (
    <Dialog open={initialMode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[800px] sm:flex-row">
        <div className="relative flex h-45 shrink-0 flex-col items-center justify-center gap-2.5 overflow-hidden bg-[linear-gradient(rgba(45,212,191,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(45,212,191,0.12)_1px,transparent_1px),linear-gradient(135deg,rgba(45,212,191,0.14),rgba(255,122,80,0.1))] bg-[length:28px_28px,28px_28px,100%_100%] sm:h-auto sm:w-[42%]">
          <div className="flex items-center gap-2 font-display text-xl">
            <span className="size-1.5 rounded-full bg-brand-coral" />
            TULASI.AI
          </div>
          <p className="font-display text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
            Calibrated, not guessed.
          </p>
        </div>

        <div className="flex flex-1 flex-col justify-center p-8 text-left">
          <DialogTitle>{isSignIn ? 'Sign in' : 'Create an account'}</DialogTitle>

          <div className="mt-5 grid gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => continueWithOAuth('google')}
              disabled={oauthPending !== null}
            >
              <GoogleIcon />
              {oauthPending === 'google' ? 'Redirecting…' : 'Continue with Google'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => continueWithOAuth('github')}
              disabled={oauthPending !== null}
            >
              <GitHubIcon />
              {oauthPending === 'github' ? 'Redirecting…' : 'Continue with GitHub'}
            </Button>
          </div>

          <div className="my-5 flex items-center gap-3 font-display text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
            <Separator className="flex-1" />
            or continue with email
            <Separator className="flex-1" />
          </div>

          <form className="grid gap-3.5" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isSignIn ? 'current-password' : 'new-password'}
              />
            </div>

            {message && <p className="text-sm text-brand-coral">{message}</p>}

            <Button type="submit" variant="warm" disabled={pending} className="mt-1">
              {pending ? 'Working…' : 'Continue'}
              <span aria-hidden="true">→</span>
            </Button>
          </form>

          <p className="mt-5 text-sm text-muted-foreground">
            {isSignIn ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              className="text-primary underline underline-offset-2"
              onClick={() => {
                setMode(isSignIn ? 'sign_up' : 'sign_in')
                setMessage(null)
              }}
            >
              {isSignIn ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
