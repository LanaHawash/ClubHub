import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
type ForgotPasswordProps = {
  onSignIn: () => void
  onHome: () => void
}

export default function ForgotPassword({
  onSignIn,onHome
}: ForgotPasswordProps) {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault()

  if (busy) return

  setBusy(true)
  setError('')

  try {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
      }),
    })

    if (!response.ok) {
      throw new Error('Unable to request password reset. Please try again.')
    }

    setSubmitted(true)
  } catch (reason) {
    setError(
      reason instanceof Error
        ? reason.message
        : 'Something went wrong. Please try again.',
    )
  } finally {
    setBusy(false)
  }
}
  return (
    <div key={submitted ? 'confirmation' : 'request'}>
       
      
    <button
    type="button"
    onClick={onHome}
    title="The hub page is not connected yet"
    className="mb-6 inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum"    >
    <ArrowLeft size={16} aria-hidden="true" />
    Back to the hub
    </button>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">
        Password reset
      </p>

      <h1 className="font-display text-5xl text-ink">
        {submitted ? 'Check your inbox.' : 'Reset your password.'}
      </h1>

      {submitted ? (
        <>
          <p role="status" className="mt-4 text-ink-2">
            If a ClubHub account exists for{' '}
            <strong className="break-all text-ink">
              {email.trim().toLowerCase()}
            </strong>
            , a password reset link will be sent to that address.
            Please check your inbox.
          </p>

          <button
            type="button"
            onClick={onSignIn}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-white transition-colors hover:bg-plum-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum"
          >
            Back to sign-in
            <ArrowRight size={18} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="mt-5 text-sm text-ink-2 underline underline-offset-4 transition-colors hover:text-ink"
          >
            Use a different email
          </button>
        </>
      ) : (
        <>
          <p className="mt-3 text-ink-2">
            Enter the email address associated with your ClubHub account.
            We'll send you a password reset link if an account exists.
          </p>

          <form
            className="mt-8 space-y-5"
            onSubmit={handleSubmit}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-ink">
                University email
              </span>

              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="S123456@scu.najah.edu"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setError('')
                }}
                className="w-full rounded-xl border border-line bg-card px-4 py-3 text-ink outline-none focus:border-ink focus:ring-4 focus:ring-rose-soft"
              />
            </label>
              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-rose-soft px-4 py-3 text-sm text-ink"
                >
                  {error}
                </p>
              )}
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-white transition-colors hover:bg-plum-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum"
              disabled={busy}
            >
              {busy ? 'Sending...' : 'Send reset link'}
              <ArrowRight size={18} aria-hidden="true" />
            </button>

            
          </form>
        </>
      )}
    </div>
  )
}