import { useState } from 'react'
import { Eye, EyeOff, KeyRound,ArrowRight,GraduationCap,ArrowLeft } from 'lucide-react'

type CreatePasswordProps = {
  email: string
  onSignIn: () => void
  onHome: () => void
}

export default function CreatePassword({
  email,
  onSignIn,
  onHome
}: CreatePasswordProps) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)

  const inputClass =
    'w-full rounded-xl border border-line bg-card px-4 py-3 text-ink outline-none focus:border-ink focus:ring-4 focus:ring-rose-soft'

  return (
    <>
      <button
        type="button"
        onClick={onHome}
        title="The hub page is not connected yet"
        className="mb-6 inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum"      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to the hub
      </button>

      <div className="mb-6 grid size-16 place-items-center rounded-2xl bg-mint text-ink">
        <KeyRound size={28} aria-hidden="true" />
      </div>

      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">
        Student registration · step 3 of 3
      </p>

      <h1 className="font-display text-5xl text-ink">
        {complete ? 'Preview complete.' : 'Set your password.'}
      </h1>

      {complete ? (
        <>
          <p role="status" className="mt-4 text-ink-2">
            Your password passed the frontend checks. No account has
            been created and your password has not been saved.
          </p>

          <button
            type="button"
            onClick={onSignIn}
            className="mt-6 w-full rounded-full bg-butter px-6 py-3 font-semibold text-ink transition hover:brightness-95"
          >
            Back to sign-in
          </button>
        </>
      ) : (
        <>
          <p className="mt-3 text-ink-2">
            Choose a password for{' '}
            <strong className="break-all text-ink">{email}</strong>.
          </p>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()

              if (password.length < 8) {
                setError('Use at least 8 characters.')
                return
              }

              if (password !== confirmation) {
                setError('The passwords do not match.')
                return
              }

              setError('')
              setPassword('')
              setConfirmation('')
              setComplete(true)
            }}
          >
            <div className="flex items-center gap-3 rounded-2xl bg-paper-2 p-4 text-sm">
              <GraduationCap
                size={22}
                aria-hidden="true"
                className="shrink-0 text-rose"
              />

              <div className="min-w-0">
                <p className="break-all font-semibold text-ink">
                  {email}
                </p>
                <p className="mt-1 text-ink-2">
                  Student details will appear here after university lookup.
                </p>
              </div>
            </div>
            <div>
              <label
                htmlFor="new-password"
                className="mb-2 block text-sm font-semibold text-ink"
              >
                Password
              </label>

              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setError('')
                  }}
                  className={`${inputClass} pr-12`}
                />

                <button
                  type="button"
                  aria-label={
                    showPassword ? 'Hide passwords' : 'Show passwords'
                  }
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((previous) => !previous)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-plum"
                >
                  {showPassword ? (
                    <EyeOff size={20} />
                  ) : (
                    <Eye size={20} />
                  )}
                </button>
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-ink">
                Confirm password
              </span>

              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                placeholder="Enter your password again"
                value={confirmation}
                onChange={(event) => {
                  setConfirmation(event.target.value)
                  setError('')
                }}
                className={inputClass}
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
            >
              Create account
              <ArrowRight size={18} aria-hidden="true" />
            </button>

            <p className="text-sm text-ink-2">
              Frontend preview — account creation is not connected yet.
            </p>
          </form>
        </>
      )}
    </>
  )
}