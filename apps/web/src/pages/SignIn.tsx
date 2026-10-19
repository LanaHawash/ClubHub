import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react'

export type SignedInAccount = {
  id: string
  email: string
  role: string
  status: string

  supervisorProfile?: {
    fullName: string
  } | null

  universityStudent?: {
    universityId: string
    fullName: string
    major: {
      id: string
      name: string
      faculty: {
        id: string
        name: string
      }
    }
  } | null
}

type SignInProps = {
  onSignUp: () => void
  onForgotPassword?: () => void
  onHome: () => void
  onSignedIn: (account: SignedInAccount, accessToken: string, expiresIn: number) => void
}

type LoginResponse = {
  accessToken: string
  expiresIn: number
}

export default function SignIn({
  onSignUp,
  onForgotPassword,
  onHome,
  onSignedIn,
}: SignInProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 400) {
          throw new Error('Invalid email or password.')
        }
        if (response.status === 429) {
          throw new Error('Too many attempts. Please wait and try again.')
        }
        throw new Error('Unable to sign in right now. Please try again.')
      }

      const login: LoginResponse = await response.json()
      if (!login.accessToken || !Number.isFinite(login.expiresIn) || login.expiresIn <= 0) {
        throw new Error('Unexpected login response. Please try again.')
      }

      const meResponse = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${login.accessToken}` },
      })

      if (!meResponse.ok) {
        throw new Error('Could not verify your session. Please try again.')
      }

      const account: SignedInAccount = await meResponse.json()
      if (!account.id || !account.email || account.status !== 'ACTIVE') {
        throw new Error('Could not verify your account. Please try again.')
      }

      onSignedIn(account, login.accessToken, login.expiresIn)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in right now.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onHome}
        className="mb-10 inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to the hub
      </button>

      <p className="mb-3 text-sm font-semibold text-rose">Sign In Page</p>
      <h1 className="font-display text-5xl text-ink">Welcome back.</h1>
      <p className="mt-3 text-ink-2">
        Sign in with your university email to manage memberships and events.
      </p>

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-ink">University Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-ink outline-none focus:border-plum focus:ring-2 focus:ring-plum/20"
            placeholder="Your university email"
            required
          />
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="signin-password" className="text-sm font-semibold text-ink">
              Password
            </label>
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-sm font-medium text-rose hover:underline"
            >
              Forgot?
            </button>
          </div>

          <div className="relative">
            <input
              id="signin-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-xl border border-line bg-card px-4 py-3 pr-12 text-ink outline-none focus:border-plum focus:ring-2 focus:ring-plum/20"
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((previous) => !previous)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-ink-2 focus-visible:outline-2 focus-visible:outline-plum"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-ink">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-white transition-colors hover:bg-plum-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
          {!submitting && <ArrowRight size={18} aria-hidden="true" />}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-ink-2">
        New here?{' '}
        <button
          type="button"
          onClick={onSignUp}
          className="font-semibold text-ink underline underline-offset-4"
        >
          Create an account
        </button>
      </p>
    </>
  )
}