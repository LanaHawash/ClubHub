import { useState } from 'react'
import { ArrowRight, ArrowLeft } from 'lucide-react'

type SignUpProps = {
  onSignIn: () => void
  onContinue: (universityId: string) => void
  onHome: () => void
}

async function errorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message
    if (Array.isArray(message)) return message.join('. ')
    if (typeof message === 'string') return message
  }
  return `Unable to send verification code (HTTP ${response.status}).`
}

export default function SignUp({ onSignIn, onContinue, onHome }: SignUpProps) {
  const [universityId, setUniversityId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const id = universityId.trim()
    if (!id || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/registration/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ universityId: id }),
      })
      if (!response.ok) throw new Error(await errorMessage(response))
      onContinue(id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start registration. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={onHome} className="mb-10 inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum">
        <ArrowLeft size={16} aria-hidden="true" /> Back to the hub
      </button>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">Student registration · step 1 of 3</p>
      <h1 className="font-display text-5xl text-ink">Create your account.</h1>
      <p className="mt-3 text-ink-2">Enter your university ID. We'll send a verification code to the university email on record.</p>
      <form className="mt-8 space-y-5" onSubmit={submit}>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-ink">University ID</span>
          <input type="text" name="universityId" autoComplete="off" placeholder="Your student ID" value={universityId}
            onChange={(event) => { setUniversityId(event.target.value); setError('') }} required maxLength={20}
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-ink outline-none focus:border-plum focus:ring-2 focus:ring-plum/20" />
        </label>
        {error && <p role="alert" className="rounded-xl bg-rose-soft px-4 py-3 text-sm text-ink">{error}</p>}
        <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-white transition-colors hover:bg-plum-2 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum">
          {busy ? 'Sending code...' : 'Send verification code'} <ArrowRight size={18} aria-hidden="true" />
        </button>
      </form>
      <p className="mt-8 text-center text-sm text-ink-2">Already registered?{' '}
        <button type="button" onClick={onSignIn} className="font-semibold text-ink underline underline-offset-4">Sign in</button>
      </p>
    </>
  )
}
