'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const next = useSearchParams().get('next') || '/'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (r.ok) router.push(next)
      else setError((await r.json().catch(() => ({}))).error ?? 'Wrong password')
    } catch {
      setError('Could not reach the server')
    } finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <div className="login-mark"><span className="hdr-mark-dot" />Strategist</div>
        <p className="login-sub">Creative intelligence · team access</p>
        <input
          className="login-in"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Team password"
          autoFocus
          aria-label="Team password"
        />
        <button className="login-go" type="submit" disabled={busy || !password}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
        {error && <p className="login-err">{error}</p>}
      </form>
    </div>
  )
}

export default function Login() {
  return <Suspense fallback={null}><LoginForm /></Suspense>
}
