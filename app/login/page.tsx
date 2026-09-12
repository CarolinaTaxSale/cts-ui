'use client'

import { useState, type FormEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

type Step = 'email' | 'code'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function requestCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Something went wrong.')
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Something went wrong.')
      router.push('/app')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="panel w-full max-w-sm p-8 shadow-lg">
        <Link href="/" className="mb-6 flex items-center gap-2.5">
          <div className="brand-mark"><Image src="/icon-96x96.png" alt="" width={32} height={32} className="h-full w-full rounded-lg" /></div>
          <span className="brand-name">CarolinaTaxSale.com</span>
        </Link>

        {step === 'email' ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Sign in or sign up</h1>
            <p className="page-subtitle">No password to remember - we&apos;ll email you a one-time code.</p>
            <form onSubmit={requestCode} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="data-label mb-2 block">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button type="submit" disabled={submitting} className="primary-button w-full cta-sweep relative disabled:opacity-60">
                {submitting ? 'Sending code…' : 'Continue with email'}
              </button>
            </form>
          </>
        ) : (
          <>
            <button onClick={() => setStep('email')} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft size={14} /> Back
            </button>
            <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
            <p className="page-subtitle">We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.</p>
            <form onSubmit={verifyCode} className="mt-6 space-y-4">
              <div>
                <label htmlFor="code" className="data-label mb-2 block">Code</label>
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  autoFocus
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-center text-lg tracking-[0.5em] outline-none focus:border-primary"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button type="submit" disabled={submitting || code.length !== 6} className="primary-button w-full cta-sweep relative disabled:opacity-60">
                {submitting ? 'Verifying…' : 'Sign in'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
