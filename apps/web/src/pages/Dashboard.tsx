import { BadgeCheck, Bell, CalendarCheck, CreditCard, UserRound } from 'lucide-react'
import type { SignedInAccount } from './SignIn'

type DashboardProps = { account: SignedInAccount; onClubs: () => void }

export default function Dashboard({ account, onClubs }: DashboardProps) {
  const cards = [
    { label: 'Active memberships', icon: BadgeCheck, color: 'bg-lilac' },
    { label: 'Upcoming events', icon: CalendarCheck, color: 'bg-butter' },
    { label: 'Payments pending', icon: CreditCard, color: 'bg-rose-soft' },
    { label: 'Unread alerts', icon: Bell, color: 'bg-mint' },
  ]
  return (
    <main className="mx-auto max-w-7xl px-5 pb-24 pt-12 sm:px-8">
      <header className="flex flex-wrap items-center gap-5">
        <span className="grid size-20 place-items-center rounded-full border-4 border-card bg-lilac shadow-md"><UserRound size={30} /></span>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-rose">Student dashboard</p>
          <h1 className="mt-2 font-display text-5xl leading-none sm:text-7xl">Welcome back.</h1>
          <p className="mt-3 text-sm text-ink-2">{account.email}</p>
        </div>
      </header>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, icon: Icon, color }) => (
          <div key={label} className={`rounded-3xl ${color} p-6`}>
            <Icon size={22} aria-hidden="true" />
            <p className="mt-8 text-sm font-semibold text-ink">{label}</p>
            <p className="mt-2 text-sm text-ink-2">Not available yet</p>
          </div>
        ))}
      </div>
      <section className="mt-12 rounded-3xl border border-ink/10 bg-card p-7 sm:p-10">
        <h2 className="font-display text-4xl">My memberships</h2>
        <p className="mt-3 max-w-xl text-ink-2">Membership data will appear here after the membership and payment APIs are implemented. No demo memberships or payments are shown.</p>
        <button type="button" onClick={onClubs} className="mt-6 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper transition hover:bg-plum-2">Explore clubs</button>
      </section>
    </main>
  )
}
