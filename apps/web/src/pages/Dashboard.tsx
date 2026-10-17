import { UserRound } from 'lucide-react'
import type { SignedInAccount } from './SignIn'
import PinnedStats from '../components/PinnedStats'

type DashboardProps = { 
   account: SignedInAccount
   onClubs: () => void
   onProfile: () => void }

export default function Dashboard({ account, onClubs, onProfile }: DashboardProps) {
  const cards = [
  { label: 'Active memberships', color: 'bg-lilac' },
  { label: 'Upcoming events', color: 'bg-butter' },
  { label: 'Payments pending', color: 'bg-rose-soft' },
  { label: 'Unread alerts', color: 'bg-mint' },
]
  return (
    <main className="mx-auto max-w-7xl px-5 pb-24 pt-12 sm:px-8">
      <header className="flex flex-wrap items-center gap-6">

  <span className="grid size-20 place-items-center rounded-full border-4 border-card bg-lilac shadow-md">
    <UserRound size={30} />
  </span>

  <div className="min-w-0 flex-1">

    <p className="font-mono text-xs uppercase tracking-[0.2em] text-rose">
      Student dashboard
    </p>

    <h1 className="mt-2 font-display text-5xl leading-none sm:text-7xl">
      Hi, {account.universityStudent?.fullName?.split(' ')[0] ?? 'Student'}.
    </h1>

  </div>

  <button
    type="button"
    onClick={onProfile}
    className="rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-paper-2"
  >
    View profile
  </button>

</header>
      <PinnedStats
  stats={cards.map(({ label, color }) => ({
    k: label,
    v: '—',
    bg: color,
  }))}
/>

      <section className="mt-12 rounded-3xl border border-ink/10 bg-card p-7 sm:p-10">
        <h2 className="font-display text-4xl">My memberships</h2>
        <p className="mt-3 max-w-xl text-ink-2">Membership data will appear here after the membership and payment APIs are implemented. No demo memberships or payments are shown.</p>
        <button type="button" onClick={onClubs} className="mt-6 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper transition hover:bg-plum-2">Explore clubs</button>
      </section>
    </main>
  )
}
