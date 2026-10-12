import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Users,
  ShieldCheck,
} from 'lucide-react'


import {
  coverColors,
  getClubInitials
} from '../components/ClubCard'

type ApiClub = {
  id: string
  name: string
  description: string
  logoUrl: string | null
  classification: string
  foundedYear?: number | null
  contactEmail?: string | null
  meetingInfo?: string | null
  status: string
}

type ClubPageProps = {
  clubId: string
  onBack: () => void
}

export default function ClubPage({
  clubId,
  onBack,
}: ClubPageProps) {

  const [club, setClub] = useState<ApiClub | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadClub() {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(
          `/api/clubs/${clubId}`,
          { signal: controller.signal }
        )

        if (!response.ok) {
          throw new Error('Unable to load club')
        }

        const data: ApiClub = await response.json()

        if (!controller.signal.aborted) {
          setClub(data)
        }

      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Something went wrong'
          )
        }

      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadClub()

    return () => controller.abort()
  }, [clubId])

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-24">
        Loading club...
      </div>
    )
  }

  if (error || !club) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-24">
        <h1 className="font-display text-5xl">
          Club not found.
        </h1>

        <button
          onClick={onBack}
          className="mt-6 rounded-full bg-ink px-6 py-3 text-white"
        >
          Browse clubs
        </button>
      </div>
    )
  }

  const initials = getClubInitials(club.name)

  return (
    <div className="min-h-screen bg-paper text-ink">

      {/* CLUB HEADER */}

      <section
  className={`relative isolate overflow-hidden text-ink ${
    coverColors[club.name] ?? 'bg-lilac'
  }`}
>
        {club.logoUrl && (
          <img
            src={club.logoUrl}
            alt=""
            className="absolute inset-0 -z-10 h-full w-full object-cover opacity-30 mix-blend-multiply"
          />
        )}

        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 right-0 select-none font-display text-[18rem] italic leading-none opacity-20"
        >
          {initials}
        </span>

        <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-8 sm:px-8 sm:pb-24">

          <button
            onClick={onBack}
            className="mb-16 inline-flex items-center gap-2 text-sm font-semibold opacity-80 hover:opacity-100"
          >
            <ArrowLeft size={16} />
            All clubs
          </button>

          <div className="flex flex-wrap gap-2">

            <span className="rounded-full bg-white/70 px-4 py-2 text-xs font-semibold">
              {club.classification.replaceAll('_', ' ')}
            </span>

          </div>

          <h1 className="anim-rise mt-5 max-w-4xl font-display text-6xl leading-[0.92] sm:text-8xl">
            {club.name}
          </h1>

          <p className="mt-5 max-w-xl text-lg opacity-85">
            {club.description}
          </p>

        </div>
      </section>

      {/* CLUB INFORMATION */}

      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_380px]">

        <div className="space-y-16">

          {/* ABOUT */}

          <section>

            <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">
              About
            </p>

            <p className="max-w-2xl font-display text-3xl leading-snug sm:text-4xl">
              {club.description}
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">

              <div className="rounded-2xl border border-ink/10 bg-card p-5">

                <Users
                  size={18}
                  className="mb-3 text-rose"
                />

                <p className="font-semibold">
                  Member count not available yet
                </p>

                {club.foundedYear && (
                  <p className="text-sm text-ink-2">
                    Since {club.foundedYear}
                  </p>
                )}

              </div>

            </div>

          </section>

          {/* BOARD */}

          <section>

            <p className="font-mono text-xs uppercase tracking-[0.2em] text-rose">
              Leadership
            </p>

            <h2 className="mt-2 font-display text-5xl">
              The board
            </h2>

            <div className="mt-8 rounded-2xl border border-ink/10 bg-card p-6">

              <p className="text-ink-2">
                Board information is not available yet.
              </p>

            </div>

            <p className="mt-4 flex items-center gap-2 text-sm text-ink-2">

              <ShieldCheck size={16} />

              Supervisor information will appear here.

            </p>

          </section>

          {/* UPCOMING EVENTS */}

          <section>

            <p className="font-mono text-xs uppercase tracking-[0.2em] text-rose">
              What's on
            </p>

            <h2 className="mt-2 font-display text-5xl">
              Upcoming events
            </h2>

            <p className="mt-6 text-ink-2">
              Club events will appear here.
            </p>

          </section>

        </div>

        {/* MEMBERSHIP PANEL */}

        <aside className="lg:sticky lg:top-24 lg:self-start">

          <div className="rounded-3xl bg-plum p-7 text-white shadow-xl">

            <p className="font-mono text-xs uppercase tracking-[0.2em] text-butter">
              Membership
            </p>

            <h2 className="mt-4 font-display text-4xl">
              Join this club
            </h2>

            <p className="mt-4 text-sm text-white/70">
              Membership registration and renewal fees
              will appear here when available.
            </p>

            <button
              disabled
              className="mt-6 w-full cursor-not-allowed rounded-full bg-butter px-6 py-3 font-semibold text-ink opacity-60"
            >
              Apply to join
            </button>

            {club.contactEmail && (
              <a
                href={`mailto:${club.contactEmail}`}
                className="mt-3 block w-full rounded-full border border-white/30 px-6 py-3 text-center text-sm font-semibold hover:bg-white/10"
              >
                Contact the club
              </a>
            )}

          </div>

        </aside>

      </div>

    </div>
  )
}