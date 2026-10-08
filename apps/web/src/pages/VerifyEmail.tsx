import { useState } from 'react'
import { MailCheck, ArrowRight, ArrowLeft } from 'lucide-react'

type VerifyEmailProps = {
  email: string
  onBack: () => void
  onVerified: () => void
}

export default function VerifyEmail({
  email,
  onBack,
    onVerified,
}: VerifyEmailProps) {
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')

  return (
    <>
        <button
            type="button"
            disabled
            title="The hub page is not connected yet"
            className="mb-10 inline-flex items-center gap-2 text-sm text-ink-2 transition-colors enabled:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum disabled:cursor-not-allowed disabled:opacity-60"
            >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to the hub
        </button>
        <div className="mb-6 grid size-16 place-items-center rounded-2xl bg-lilac text-ink">
          <MailCheck size={28} aria-hidden="true" />
        </div>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">
        Student registration · step 2 of 3
      </p>

      <h1 className="font-display text-5xl text-ink">
        Check your inbox.
      </h1>

      <p className="mt-3 text-ink-2">
        Enter the verification code for{' '}
        <strong className="break-all text-ink">{email}</strong>.
        </p>

        <p className="mt-2 text-sm text-ink-2">
        Email delivery is not connected yet. No email has been sent.
        </p>

      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => {
        event.preventDefault()

        if (code !== '123456') {
            setMessage('The code is incorrect. Please try again.')
            return
        }

        setMessage('')
        onVerified()
        }}
      >
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-ink">
            Verification code
          </span>

          <input
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]{6}"
            required
            placeholder="000000"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, ''))
              setMessage('')
            }}
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-center font-mono text-lg tracking-[0.5em] text-ink outline-none focus:border-plum focus:ring-4 focus:ring-rose-soft"
          />
        </label>

        <button
            type="submit"
            disabled={code.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-butter px-6 py-3 font-semibold text-ink hover:brightness-95 disabled:cursor-not-allowed disabled:bg-ink/40 disabled:text-white disabled:hover:brightness-100"
            >
            Verify code
            <ArrowRight size={18} aria-hidden="true" />
            </button>

        <p role="status" className="text-sm text-ink-2">
          {message}
        </p>
      </form>

                <div className="mt-6 flex items-center justify-between gap-4 text-sm text-ink-2">
            <button
                type="button"
                onClick={onBack}
                className="underline underline-offset-4 hover:text-ink"
            >
                Use a different email
            </button>

            <button
                type="button"
                onClick={() => {
                setCode('')
                setMessage('Email delivery is not connected yet.')
                }}
                className="underline underline-offset-4 hover:text-ink"
            >
                Resend code
            </button>
            </div>
    </>
  )
}