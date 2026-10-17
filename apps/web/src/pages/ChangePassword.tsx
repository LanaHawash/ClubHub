import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

type ChangePasswordProps = {
  accessToken: string
  onBack: () => void
  onPasswordChanged: () => void
}

export default function ChangePassword({
  accessToken,
  onBack,
  onPasswordChanged,
}: ChangePasswordProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (busy) return

    setError('')

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    if (newPassword === currentPassword) {
      setError('Your new password must be different from your current password.')
      return
    }

    if (newPassword.length < 8 || newPassword.length > 72) {
      setError('Password must contain between 8 and 72 characters.')
      return
    }

    setBusy(true)

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)

        throw new Error(
          typeof data?.message === 'string'
            ? data.message
            : 'Unable to change password. Please try again.',
        )
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')

      onPasswordChanged()
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
        onClick={onBack}
        className="mb-10 inline-flex items-center gap-2 text-sm text-ink-2 hover:text-ink"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">
        Account security
      </p>

      <h1 className="font-display text-5xl text-ink">
        Change your password.
      </h1>

      <p className="mt-3 text-ink-2">
        Enter your current password and choose a new password.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-ink">
            Current password
          </span>

          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.target.value)
              setError('')
            }}
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-ink outline-none focus:border-ink focus:ring-4 focus:ring-rose-soft"
          />
        </label>

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
          {busy ? 'Updating password...' : 'Change password'}
          <ArrowRight size={18} />
        </button>
      </form>
    </>
  )
}