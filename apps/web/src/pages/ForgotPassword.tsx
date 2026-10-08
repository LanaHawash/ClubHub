import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
type ForgotPasswordProps = {
  onSignIn: () => void
}

export default function ForgotPassword({
  onSignIn,
}: ForgotPasswordProps) {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  return (
    <div key={submitted ? 'confirmation' : 'request'}>
       
      
    <button
    type="button"
    disabled
    title="The hub page is not connected yet"
    className="mb-10 inline-flex items-center gap-2 text-sm text-ink-2 transition-colors enabled:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum disabled:cursor-not-allowed disabled:opacity-60"
    >
    <ArrowLeft size={16} aria-hidden="true" />
    Back to the hub
    </button>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">
        Password reset
      </p>

      <h1 className="font-display text-5xl text-ink">
        {submitted ? 'Request preview.' : 'Reset your password.'}
      </h1>

      {submitted ? (
        <>
          <p role="status" className="mt-4 text-ink-2">
            Reset-request preview for{' '}
            <strong className="break-all text-ink">{email}</strong>.
            No email has been sent because email delivery is not
            connected yet.
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
            Enter your university email. Once connected, we’ll send
            a reset link if an account exists for that address.
          </p>

          <form
            className="mt-8 space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              setEmail(email.trim().toLowerCase())
              setSubmitted(true)
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-ink">
                University email
              </span>

              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="sID@stu.najah.edu"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-line bg-card px-4 py-3 text-ink outline-none focus:border-ink focus:ring-4 focus:ring-rose-soft"
              />
            </label>

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-white transition-colors hover:bg-plum-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum"
            >
              Send reset link
              <ArrowRight size={18} aria-hidden="true" />
            </button>

            <p className="text-sm text-ink-2">
              Frontend preview — no reset email will be sent.
            </p>
          </form>
        </>
      )}
    </div>
  )
}