import { useEffect, useState } from 'react'

type Club = {
  id: string
  name: string
  description: string
  classification: string
  status: 'ACTIVE' | 'ARCHIVED'
  contactEmail: string
  supervisor: {
    id: string
    fullName: string
  } | null
}

type Props = {
  accessToken: string
  onSignOut: () => void
}

export default function ClubAdminDashboard({
  accessToken,
  onSignOut,
}: Props) {
  const [club, setClub] = useState<Club | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadClub() {
      try {
        const response = await fetch('/api/clubs/my-club', {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error(`Unable to load club (${response.status}).`)
        }

        const data: Club = await response.json()

        if (!controller.signal.aborted) {
          setClub(data)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load your club.',
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
  }, [accessToken])

  return (
    <main className="min-h-screen bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-rose">
              ClubHub
            </p>
            <h1 className="font-display text-4xl sm:text-5xl">
              Club Administration
            </h1>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold hover:bg-ink/5"
          >
            Sign out
          </button>
        </header>

        {loading && (
          <p className="text-ink-2">Loading your club...</p>
        )}

        {error && (
          <p role="alert" className="rounded-2xl bg-rose/10 p-5 text-rose">
            {error}
          </p>
        )}

        {!loading && !error && club && (
          <section className="rounded-3xl border border-ink/10 bg-card p-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-rose">
              Your assigned club
            </p>

            <h2 className="font-display text-4xl">
              {club.name}
            </h2>

            <p className="mt-4 text-ink-2">
              {club.description}
            </p>

            <div className="mt-6 space-y-3 text-sm">
              <p>
                <strong>Status:</strong> {club.status}
              </p>

              <p>
                <strong>Classification:</strong>{' '}
                {club.classification.replaceAll('_', ' ')}
              </p>

              <p>
                <strong>Contact:</strong> {club.contactEmail}
              </p>

              <p>
                <strong>Supervisor:</strong>{' '}
                {club.supervisor?.fullName ?? 'Not assigned'}
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}