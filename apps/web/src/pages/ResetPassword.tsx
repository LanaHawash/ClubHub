import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

type ResetPasswordProps = {
  token: string
  onSignIn: () => void
}

export default function ResetPassword({
  token,
  onSignIn,
}: ResetPasswordProps) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (busy) return

    setError('')

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (newPassword.length < 8 || newPassword.length > 72) {
      setError('Password must contain between 8 and 72 characters.')
      return
    }

    setBusy(true)

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          newPassword,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)

        throw new Error(
          typeof data?.message === 'string'
            ? data.message
            : 'Unable to reset password. The link may have expired.',
        )
      }

      setSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
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
    <>
      <button
        type="button"
        onClick={onSignIn}
        className="mb-10 inline-flex items-center gap-2 text-sm text-ink-2 hover:text-ink"
      >
        <ArrowLeft size={16} />
        Back to sign-in
      </button>

      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">
        Password recovery
      </p>

      <h1 className="font-display text-5xl text-ink">
        {success ? 'Password updated.' : 'Create a new password.'}
      </h1>

      {success ? (
        <>
          <p role="status" className="mt-4 text-ink-2">
            Your password has been reset successfully.
            You can now sign in using your new password.
          </p>

          <button
            type="button"
            onClick={onSignIn}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-white hover:bg-plum-2"
          >
            Go to sign-in
            <ArrowRight size={18} />
          </button>
        </>
      ) : !token ? (
        <div className="mt-6">
          <p role="alert" className="text-ink-2">
            This password reset link is invalid.
            Please request a new link from the Forgot Password page.
          </p>

          <button
            type="button"
            onClick={onSignIn}
            className="mt-6 font-semibold text-ink underline"
          >
            Back to sign-in
          </button>
        </div>
      ) : (
        <>
          <p className="mt-3 text-ink-2">
            Enter your new password below.
            Your password must contain at least 8 characters.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-8 space-y-5"
          >
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-ink">
                New password
              </span>

              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value)
                  setError('')
                }}
                className="w-full rounded-xl border border-line bg-card px-4 py-3 text-ink outline-none focus:border-ink focus:ring-4 focus:ring-rose-soft"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-ink">
                Confirm new password
              </span>

              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
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
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-white hover:bg-plum-2 disabled:cursor-wait disabled:opacity-50"
            >
              {busy ? 'Resetting password...' : 'Reset password'}
              <ArrowRight size={18} />
            </button>
          </form>
        </>
      )}
    </>
  )
}