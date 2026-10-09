import { useState } from 'react'
import { ArrowRight, ArrowLeft } from 'lucide-react'
type SignUpProps = {
  onSignIn: () => void
  onContinue: (email: string) => void
  onHome: () => void
}

export default function SignUp({ onSignIn, onContinue, onHome }: SignUpProps) {
  const [email, setEmail] = useState('')
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

      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">
        Student registration · step 1 of 3
      </p>

        <h1 className="font-display text-5xl text-ink">
          Create your account.
        </h1>

        <p className="mt-3 text-ink-2">
          Start with your university email.
        </p>

        <form
          className="mt-8 space-y-5"
          onSubmit={(event) => { event.preventDefault() 
            onContinue(email.trim().toLowerCase())
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-xl border border-line bg-card px-4 py-3 text-ink outline-none focus:border-plum focus:ring-2 focus:ring-plum/20"
            />
          </label>

          <button
            type="submit"
className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-white transition-colors hover:bg-plum-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum"          >
            Send verification code
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>
        <p className="mt-4 text-sm text-ink-2">
  Frontend preview — no verification email is sent yet.
</p>

        <p className="mt-8 text-center text-sm text-ink-2">
          Already registered?{' '}
          <button
            type="button"
            onClick={onSignIn}
            className="font-semibold text-ink underline underline-offset-4"
          >
            Sign in
          </button>
        </p>
      </>
    
  )
}