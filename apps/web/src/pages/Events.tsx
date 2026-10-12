import { useEffect, useMemo, useState } from 'react'
import EventFeed, { type EventFeedData, type EventType } from '../components/EventFeed'
import EventModal from '../components/EventModal'

type ApiEvent = {
  id: string
  title: string
  description: string
  category: string
  startDate: string
  endDate: string | null
  startTime: string | null
  location: string | null
  imageUrl: string | null
  sourceUrl: string | null
  registrationOpen?: boolean
  registrationDeadline?: string | null
  eligibility?: string
  capacity?: number | null
  isFree?: boolean
  memberFee?: string | number
  nonMemberFee?: string | number
  currency?: string
  club: { id: string; name: string }
}

type Period = 'upcoming' | 'past'

const categories: Record<string, EventType> = {
  WORKSHOP: 'Workshop', SEMINAR: 'Seminar', CAMPAIGN: 'Campaign',
  CONFERENCE: 'Conference', SOCIAL: 'Social', VOLUNTEERING: 'Volunteering',
  OTHER: 'Other',
}

function toFeedEvent(event: ApiEvent): EventFeedData {
  return {
    id: event.id,
    endDate: event.endDate?.slice(0, 10) ?? null,
    startTime: event.startTime,
    clubId: event.club.id,
    registrationOpen: event.registrationOpen ?? false,
    registrationDeadline: event.registrationDeadline?.slice(0,10) ?? null,
    eligibility: event.eligibility,
    capacity: event.capacity,
    isFree: event.isFree,
    memberFee: event.memberFee,
    nonMemberFee: event.nonMemberFee,
    currency: event.currency,
    title: event.title,
    type: categories[event.category] ?? 'Other',
    date: event.startDate.slice(0, 10),
    imageUrl: event.imageUrl,
    location: event.location ?? '',
    organizerName: event.club.name,
    description: event.description,
    sourceUrl: event.sourceUrl,
    // No fee / capacity values: the Events schema does not store those yet.
  }
}

export default function Events({ isSignedIn, onSignIn }: { isSignedIn: boolean; onSignIn: () => void }) {
  const [period, setPeriod] = useState<Period>('upcoming')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [events, setEvents] = useState<EventFeedData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch(`/api/events?period=${period}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Events API returned HTTP ${response.status}`)
        return response.json() as Promise<ApiEvent[]>
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Unexpected events response')
        if (!controller.signal.aborted) setEvents(data.map(toFeedEvent))
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to load events')
          setEvents([])
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })

    return () => controller.abort()
  }, [period, retry])

  const periodLabel = useMemo(() => period === 'upcoming' ? 'Upcoming events' : 'Past events', [period])

  return (
    <div className="min-h-screen bg-paper text-ink">
      <main className="mx-auto max-w-7xl px-5 pb-24 pt-14 sm:px-8">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">Calendar</p>
        <h1 className="mb-10 font-display text-6xl leading-[0.95] sm:text-8xl">
          What's <em className="text-rose">on</em>
        </h1>

        <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Event period">
          {(['upcoming', 'past'] as const).map((item) => (
            <button key={item} type="button" aria-pressed={period === item}onClick={() => setPeriod(item)}
              className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition ${period === item ? 'border-ink bg-ink text-paper' : 'border-ink/20 hover:border-ink'}`}>
              {item === 'upcoming' ? 'Upcoming Events' : 'Past Events'}
            </button>
          ))}
        </div>

        {loading ? (
          <p role="status" className="rounded-3xl border border-dashed border-ink/25 p-10 text-center text-ink-2">Loading {periodLabel.toLowerCase()}â€¦</p>
        ) : error ? (
          <div role="alert" className="rounded-3xl border border-rose/30 bg-rose-soft p-8 text-ink">
            <p className="font-semibold">Couldn't load events.</p>
            <p className="mt-2 text-sm">{error}</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper">Retry</button>
          </div>
        ) : (
          <EventFeed key={period} onEventClick={setSelectedEventId} events={events} limit={Number.POSITIVE_INFINITY} sortOrder={period === 'upcoming' ? 'asc' : 'desc'} isPast={period === 'past'}
            emptyMessage={period === 'upcoming' ? 'No upcoming events have been published yet. Explore Past Events to see university activities.' : 'Nopast events are available yet.'} />
        )}
        <EventModal
          event={events.find((event) => event.id === selectedEventId) ?? null}
          isPast={period === 'past'}
          isSignedIn={isSignedIn}
          onSignIn={onSignIn}
          onClose={() => setSelectedEventId(null)}
        />
      </main>
    </div>
  )
}
