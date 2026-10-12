import { useState } from 'react'
import { Eye, EyeOff, KeyRound, ArrowRight, GraduationCap, ArrowLeft } from 'lucide-react'

type CreatePasswordProps = {
  universityId: string
  registrationToken: string
  onSignIn: () => void
  onHome: () => void
}

async function errorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message
    if (Array.isArray(message)) return message.join('. ')
    if (typeof message === 'string') return message
  }
  return `Unable to create account (HTTP ${response.status}).`
}

export default function CreatePassword({ universityId, registrationToken, onSignIn, onHome }: CreatePasswordProps) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const inputClass = 'w-full rounded-xl border border-line bg-card px-4 py-3 text-ink outline-none focus:border-ink focus:ring-4 focus:ring-rose-soft'

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (password.length < 8) { setError('Use at least 8 characters.'); return }
    if (password !== confirmation) { setError('The passwords do not match.'); return }
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/registration/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationToken, password }),
      })
      if (!response.ok) throw new Error(await errorMessage(response))
      setPassword('')
      setConfirmation('')
      setComplete(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create your account. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={onHome} className="mb-6 inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum">
        <ArrowLeft size={16} aria-hidden="true" /> Back to the hub
      </button>
      <div className="mb-6 grid size-16 place-items-center rounded-2xl bg-mint text-ink"><KeyRound size={28} aria-hidden="true" /></div>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">Student registration · step 3 of 3</p>
      <h1 className="font-display text-5xl text-ink">{complete ? 'Account created.' : 'Set your password.'}</h1>
      {complete ? (
        <>
          <p role="status" className="mt-4 text-ink-2">Your ClubHub account has been created successfully. You can now sign in.</p>
          <button type="button" onClick={onSignIn} className="mt-6 w-full rounded-full bg-butter px-6 py-3 font-semibold text-ink transition hover:brightness-95">Go to sign-in</button>
        </>
      ) : (
        <>
          <p className="mt-3 text-ink-2">Choose a password for student ID{' '}<strong className="break-all text-ink">{universityId}</strong>.</p>
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <div className="flex items-center gap-3 rounded-2xl bg-paper-2 p-4 text-sm">
              <GraduationCap size={22} aria-hidden="true" className="shrink-0 text-rose" />
              <div className="min-w-0"><p className="break-all font-semibold text-ink">{universityId}</p><p className="mt-1 text-ink-2">Verified university student</p></div>
            </div>
            <div>
              <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-ink">Password</label>
              <div className="relative">
                <input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required placeholder="At least 8 characters"
                  value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} className={`${inputClass} pr-12`} />
                <button type="button" aria-label={showPassword ? 'Hide passwords' : 'Show passwords'} aria-pressed={showPassword}
                  onClick={() => setShowPassword((previous) => !previous)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-plum">
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            <label className="block"><span className="mb-2 block text-sm font-semibold text-ink">Confirm password</span>
              <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" required placeholder="Enter your password again"
                value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError('') }} className={inputClass} />
            </label>
            {error && <p role="alert" className="rounded-xl bg-rose-soft px-4 py-3 text-sm text-ink">{error}</p>}
            <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-white transition-colors hover:bg-plum-2 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum">
              {busy ? 'Creating account...' : 'Create account'} <ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>
        </>
      )}
    </>
  )
}
