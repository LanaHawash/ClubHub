import { useEffect, useState } from 'react'
import { MailCheck, ArrowRight, ArrowLeft } from 'lucide-react'

type VerifyEmailProps = {
  universityId: string
  onBack: () => void
  onVerified: (registrationToken: string) => void
  onHome: () => void
}

async function errorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message
    if (Array.isArray(message)) return message.join('. ')
    if (typeof message === 'string') return message
  }
  return `Request failed (HTTP ${response.status}).`
}

export default function VerifyEmail({ universityId, onBack, onVerified, onHome }: VerifyEmailProps) {
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(120)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || code.length !== 6) return
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/auth/registration/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ universityId, code }),
      })
      if (!response.ok) throw new Error(await errorMessage(response))
      const data: unknown = await response.json()
      if (!data || typeof data !== 'object' || !('registrationToken' in data) || typeof data.registrationToken !== 'string') {
        throw new Error('Verification succeeded, but no registration token was returned.')
      }
      onVerified(data.registrationToken)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Verification failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    if (busy || cooldown > 0) return
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/auth/registration/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ universityId }),
      })
      if (!response.ok) throw new Error(await errorMessage(response))
      setCode('')
      setCooldown(120)
      setMessage('A new verification code has been sent to your university email.')
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Unable to resend the code.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={onHome} className="mb-10 inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum">
        <ArrowLeft size={16} aria-hidden="true" /> Back to the hub
      </button>
      <div className="mb-6 grid size-16 place-items-center rounded-2xl bg-lilac text-ink"><MailCheck size={28} aria-hidden="true" /></div>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">Student registration · step 2 of 3</p>
      <h1 className="font-display text-5xl text-ink">Check your inbox.</h1>
      <p className="mt-3 text-ink-2">Enter the verification code sent to the university email linked to student ID{' '}
        <strong className="break-all text-ink">{universityId}</strong>.
      </p>
      <form className="mt-8 space-y-5" onSubmit={verify}>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-ink">Verification code</span>
          <input type="text" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required
            placeholder="000000" value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '')); setMessage('') }}
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-center font-mono text-lg tracking-[0.5em] text-ink outline-none focus:border-plum focus:ring-4 focus:ring-rose-soft" />
        </label>
        <button type="submit" disabled={busy || code.length !== 6}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-butter px-6 py-3 font-semibold text-ink hover:brightness-95 disabled:cursor-not-allowed disabled:bg-ink/40 disabled:text-white disabled:hover:brightness-100">
          {busy ? 'Verifying...' : 'Verify code'} <ArrowRight size={18} aria-hidden="true" />
        </button>
        {message && <p role="status" className="text-sm text-ink-2">{message}</p>}
      </form>
      <div className="mt-6 flex items-center justify-between gap-4 text-sm text-ink-2">
        <button type="button" onClick={onBack} className="underline underline-offset-4 hover:text-ink">Use a different university ID</button>
        <button type="button" disabled={busy || cooldown > 0} onClick={() => void resend()}
          className="underline underline-offset-4 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50">
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </>
  )
}
