import { useEffect, useState } from 'react'
import { ArrowLeft, Building2, CalendarDays, CreditCard, LayoutDashboard, Mail, Users } from 'lucide-react'

type Club = {
  id: string
  name: string
  description?: string | null
  contactEmail?: string | null
  classification?: string
  status?: string
  foundedYear?: number | null
  meetingInfo?: string | null
}
type Overview = {
  club: Club
  administrator: { assignmentId: string; position: 'PRESIDENT' | 'SECOND_ADMIN' }
}
type Section = '' | 'events' | 'messages' | 'members' | 'payments' | 'club'
type Props = { accessToken: string; clubId: string; onBack: () => void }

const NAV = [
  ['', 'Overview', LayoutDashboard],
  ['events', 'Events', CalendarDays],
  ['messages', 'Messages', Mail],
  ['members', 'Members', Users],
  ['payments', 'Money', CreditCard],
  ['club', 'Club profile', Building2],
] as const

// Visual shell is ported from Figma Make src/admin/AdminApp.tsx.
// No Figma demo store, fabricated statistics, or hardcoded club records.
export default function ClubAdminDashboard({ accessToken, clubId, onBack }: Props) {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [section, setSection] = useState<Section>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setOverview(null)
    async function load() {
      try {
        const response = await fetch(`/api/clubs/${clubId}/admin/overview`, {
          signal: controller.signal,
          cache: 'no-store',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (response.status === 403) throw new Error('Your club administrator assignment is no longer active.')
        if (!response.ok) throw new Error(`Unable to load club (${response.status}).`)
        const data: Overview = await response.json()
        if (!controller.signal.aborted) setOverview(data)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load club.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [accessToken, clubId])

  const club = overview?.club
  const firstWord = club?.name.split(/\s+/)[0] ?? ''
  const initials = club?.name.split(/\s+/).slice(0, 3).map((word) => word[0]?.toUpperCase()).join('') ?? 'CH'
  const currentLabel = NAV.find(([key]) => key === section)?.[1] ?? 'Overview'

  function sectionBody() {
    if (!club) return null
    if (section === '') {
      return (
        <>
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-rose">Overview</p>
              <h1 className="font-display text-5xl leading-none sm:text-6xl">Welcome back, <em className="text-rose">{firstWord}</em>.</h1>
              <p className="mt-3 max-w-xl text-ink-2">Here is what is happening across your events right now.</p>
            </div>
          </div>
          {/* Figma source has four live stats. Do not invent counts when the APIs are missing. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Upcoming events', 'bg-card'],
              ['Registrations', 'bg-lilac/40'],
              ['Money collected', 'bg-mint/60'],
              ['Awaiting payment', 'bg-butter/60'],
            ].map(([label, tone]) => (
              <div key={label} className={`rounded-3xl border border-ink/10 p-5 ${tone}`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-2">{label}</p>
                <p className="mt-2 font-display text-2xl leading-none text-ink-2">Not available</p>
                <p className="mt-2 text-sm text-ink-2">Awaiting real reporting API</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-3xl border border-ink/10 bg-card p-5 sm:p-6">
              <h2 className="mb-4 font-display text-2xl leading-none">Upcoming events</h2>
              <p className="text-sm text-ink-2">Connect the club events API to populate this panel.</p>
            </section>
            <div className="space-y-6">
              {['Messages', 'Needs your attention', 'Club membership'].map((label) => (
                <section key={label} className="rounded-3xl border border-ink/10 bg-card p-5 sm:p-6">
                  <h2 className="mb-4 font-display text-2xl leading-none">{label}</h2>
                  <p className="text-sm text-ink-2">No live data connected yet.</p>
                </section>
              ))}
            </div>
          </div>
        </>
      )
    }
    if (section === 'club') {
      return (
        <>
          <div className="mb-8">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-rose">Club profile</p>
            <h1 className="font-display text-5xl leading-none sm:text-6xl">How students see you</h1>
            <p className="mt-3 max-w-xl text-ink-2">Your public club information.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-3xl border border-ink/10 bg-card p-5 sm:p-6">
              <h2 className="mb-4 font-display text-2xl">Public details</h2>
              <p className="whitespace-pre-wrap text-ink-2">{club.description || 'No description available.'}</p>
            </section>
            <section className="rounded-3xl border border-ink/10 bg-card p-5 sm:p-6">
              <h2 className="mb-4 font-display text-2xl">Managed by the Deanship</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-ink-2">Club email</dt><dd className="text-right font-semibold">{club.contactEmail || 'Not provided'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-2">Administrator position</dt><dd className="text-right font-semibold">{overview?.administrator.position === 'PRESIDENT' ? 'President' : 'Second administrator'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-2">Status</dt><dd className="text-right font-semibold">{club.status ?? 'Not available'}</dd></div>
              </dl>
            </section>
          </div>
        </>
      )
    }
    return (
      <>
        <div className="mb-8">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-rose">{currentLabel}</p>
          <h1 className="font-display text-5xl leading-none sm:text-6xl">{currentLabel}</h1>
        </div>
        <section className="rounded-3xl border border-ink/10 bg-card p-5 sm:p-6">
          <p className="text-sm text-ink-2">The Figma {currentLabel.toLowerCase()} screen needs its corresponding club-scoped API connection. No demonstration records are shown.</p>
        </section>
      </>
    )
  }

  return (
    <div className="min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="border-b border-ink/10 bg-paper-2 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-4 p-4 lg:gap-6 lg:p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-lilac font-display text-xl italic text-ink">{initials}</span>
            <div className="min-w-0">
              <p className="truncate font-display text-2xl leading-none">{club?.name ?? 'Club administration'}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-ink-2">Club admin</p>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Admin">
            {NAV.map(([key, label, Icon]) => {
              const active = section === key
              return (
                <button key={key} type="button" onClick={() => setSection(key)} aria-current={active ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition ${active ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`}>
                  <Icon size={17} aria-hidden="true" /> {label}
                </button>
              )
            })}
          </nav>
          <div className="mt-auto hidden space-y-1 lg:block">
            <button type="button" onClick={onBack} className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold text-ink-2 hover:bg-ink/10"><ArrowLeft size={17} /> Student site</button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-5xl anim-rise">
          {loading ? <p className="text-ink-2">Loading club administration...</p> : error ? (
            <div role="alert" className="rounded-3xl border border-rose/30 bg-card p-6"><p className="text-rose">{error}</p><button type="button" onClick={onBack} className="mt-4 rounded-full border border-ink/20 px-4 py-2">Student site</button></div>
          ) : sectionBody()}
        </div>
        <div className="mx-auto mt-10 flex max-w-5xl gap-4 text-sm font-semibold text-ink-2 lg:hidden"><button type="button" onClick={onBack}>Student site</button></div>
      </main>
    </div>
  )
}