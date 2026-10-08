import type { ReactNode } from 'react'
import studentCard from '../assets/DEMO.jpeg'

type AuthLayoutProps = {
  children: ReactNode
  isSignUp?: boolean
  pageKey: string
}

export default function AuthLayout({
  children,
  isSignUp = false,
  pageKey,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-paper lg:flex">
      <aside
        className={`grain relative hidden min-h-screen w-[52%] flex-col justify-between overflow-hidden bg-plum p-10 text-white transition-transform duration-[1000ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none lg:flex ${
        isSignUp ? 'lg:translate-x-[92.3077%]' : ''
        }`}
      >
        <div
  aria-hidden="true"
  className="absolute -right-32 -top-20 size-[26rem] rounded-full bg-lilac/25 blur-3xl"
/>
        <div
          aria-hidden="true"
          className="absolute -left-24 top-1/3 size-96 rounded-full bg-rose/30 blur-3xl"
        />

        <div className="relative flex items-center gap-2">
        <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-full bg-butter font-display text-xl italic text-ink"
        >
            CH
        </span>

        <span className="font-display text-3xl">ClubHub</span>
        </div>
        <h2  key={isSignUp ? 'signup-heading' : 'signin-heading'}
            className="anim-clear-in relative max-w-md font-display text-7xl leading-tight">
          {isSignUp ? (
            <>
              New here? Be part of the{' '}
              <em className="text-rose">team</em>.
            </>
          ) : (
            <>
              Find your <em className="text-rose">people</em>.
              Join in a minute.
            </>
          )}
        </h2>
    <div className="relative flex items-end justify-between gap-6">
        <ul  key={isSignUp ? 'signup-list' : 'signin-list'}
             className="anim-clear-in relative space-y-3 text-sm text-white/70">
            {(isSignUp
                ? [
                    'Sign up with your university email',
                    'Join clubs and meet people who share your interests',
                    'Collect certificates for your participation',
                ]
                : [
                    'Discover clubs across your university',
                    'Explore events and manage your memberships',
                    'Access your digital cards and certificates',
                ]
            ).map((text) => (
                <li key={text} className="flex items-start gap-2">
                <span aria-hidden="true" className="text-butter">
                    ✦
                </span>
                {text}
                </li>
            ))}
            </ul>
             <div
                aria-hidden="true"
                className="anim-sway mr-4 hidden w-48 shrink-0 xl:block"
            >
                <div className="mx-auto h-20 w-5 rounded-b bg-rose-soft" />

                <div className="-mt-1 rounded-3xl border-4 border-lilac/60 bg-plum-2 p-3 shadow-2xl">
                <img
                    src={studentCard}
                    alt=""
                    className="h-36 w-full rounded-2xl object-cover"
                    />

                <p className="mt-3 font-display text-3xl leading-none">
                    Student Name
                </p>

                <p className="mt-1 text-xs text-white/60">
                    University community
                </p>

                <div className="mt-3 h-5 bg-[repeating-linear-gradient(90deg,#fff_0_2px,transparent_2px_4px)] opacity-60" />
                </div>
            </div>
            </div>
      </aside>

      <main
        className={`flex min-h-screen w-full items-center justify-center px-6 py-12 transition-transform duration-[1000ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none lg:w-[48%] ${
            isSignUp ? 'lg:-translate-x-[108.3333%]' : ''
                }`}
        >
        <div
        key={isSignUp ? 'signup' : 'signin'}
        className="anim-clear w-full max-w-md"
        >
        <div key={pageKey} className="anim-rise">
            {children}
        </div>
        </div>
        </main>
            </div>
        )
}