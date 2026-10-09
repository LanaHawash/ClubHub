import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { ArrowRight, ArrowLeft } from 'lucide-react'
        type SignInProps = {
        onSignUp: () => void
        onForgotPassword?: () => void
        onHome: () => void
        }

export default function SignIn({ onSignUp, onForgotPassword, onHome, }: SignInProps) {
    const [showPassword, setShowPassword] = useState(false)
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
      <p className="mb-3 text-sm font-semibold text-rose">
         Sign In Page
        </p>
        <h1 className="font-display text-5xl text-ink">Welcome back.</h1>
        <p className="mt-3 text-ink-2">
          Sign in with your university email to manage memberships and events.
        </p>

        <form className="mt-6 space-y-5" onSubmit={(event) => event.preventDefault()}>
            <label className="block">
               <span className="mb-2 block text-sm font-semibold text-ink">University Email</span>
                <input type="email" name="email" autoComplete="username" className="w-full rounded-xl border border-line bg-card px-4 py-3 text-ink outline-none focus:border-plum focus:ring-2 focus:ring-plum/20" placeholder="sID@stu.najah.edu" required />
                
                </label>

                 <div>
                <div className="mb-2 flex items-center justify-between">
                    <label
                        htmlFor="signin-password"
                        className="text-sm font-semibold text-ink"
                    >
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

                <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-white transition-colors hover:bg-plum-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum"                >
                    Sign in
                    <ArrowRight size={18} aria-hidden="true" />
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