import { useState } from 'react'

export type EventType =
  | 'Competition'
  | 'Performance'
  | 'Talk'
  | 'Workshop'
  | 'Social'

export type EventFeedData = {
  id: string
  title: string
  type: EventType
  date: string
  imageUrl: string
  location: string
  organizerName: string
  fee: number
  capacity: number | null
  seatsLeft: number | null
}

type EventFeedProps = {
  events: EventFeedData[]
  onEventClick?: (id: string) => void
}

const types: (EventType | 'All')[] = [
  'All',
  'Competition',
  'Performance',
  'Talk',
  'Workshop',
  'Social',
]

const TYPE_TONE: Record<EventType, string> = {
  Workshop: 'bg-mint text-[#16342a]',
  Competition: 'bg-butter text-ink',
  Talk: 'bg-lilac text-plum',
  Social: 'bg-rose-soft text-[#8a1f47]',
  Performance: 'bg-ink text-paper',
}

export default function EventFeed({
  events,
  onEventClick,
}: EventFeedProps) {
  const [type, setType] = useState<EventType | 'All'>('All')

  const filteredEvents = events
    .filter((event) => type === 'All' || event.type === type)
    .sort(
      (a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    )
    .slice(0, 5)

  return (
    <div>
      <div
        className="no-scrollbar mb-6 flex gap-2 overflow-x-auto"
        role="tablist"
        aria-label="Filter events by type"
      >
        {types.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={type === item}
            onClick={() => setType(item)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              type === item
                ? 'border-ink bg-ink text-paper'
                : 'border-ink/20 hover:border-ink'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 && (
        <p className="rounded-3xl border border-dashed border-ink/25 p-10 text-center text-ink-2">
          Nothing scheduled here yet. Check back soon.
        </p>
      )}

      <ul className="divide-y divide-ink/15 border-y border-ink/15">
        {filteredEvents.map((event) => {
          const date = new Date(event.date)

          const unlimited = event.capacity === null

          const percentage =
            unlimited || !event.capacity
              ? 0
              : Math.min(
                  100,
                  ((event.capacity - (event.seatsLeft ?? 0)) /
                    event.capacity) *
                    100,
                )

          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onEventClick?.(event.id)}
                className="group grid w-full grid-cols-[4.5rem_1fr] items-center gap-x-5 gap-y-3 py-6 text-left transition hover:bg-card/70 sm:grid-cols-[6rem_8rem_1fr_auto] sm:px-3"
              >
                <div className="text-center">
                  <p className="font-display text-5xl leading-none sm:text-6xl">
                    {date.getDate()}
                  </p>

                  <p className="font-mono text-[11px] uppercase tracking-widest text-ink-2">
                    {date.toLocaleDateString('en-GB', {
                      month: 'short',
                    })}
                    {' · '}
                    {date.toLocaleDateString('en-GB', {
                      weekday: 'short',
                    })}
                  </p>
                </div>

                <img
                  src={event.imageUrl}
                  alt=""
                  loading="lazy"
                  className="hidden aspect-[4/3] w-full rounded-2xl object-cover sm:block"
                />

                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${TYPE_TONE[event.type]}`}
                    >
                      {event.type}
                    </span>
                  </div>

                  <h3 className="font-display text-3xl leading-tight group-hover:underline group-hover:decoration-rose group-hover:underline-offset-4">
                    {event.title}
                  </h3>

                  <p className="mt-1 text-sm text-ink-2">
                    {event.location} · {event.organizerName}
                  </p>
                </div>

                <div className="col-span-2 flex items-center justify-between gap-6 sm:col-span-1 sm:flex-col sm:items-end sm:gap-3">
                  <p className="font-display text-3xl">
                    {event.fee === 0 ? 'Free' : event.fee}
                  </p>

                  <div className="w-28">
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                      <div
                        className="h-full rounded-full bg-rose"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    <p className="mt-1 text-right text-xs text-ink-2">
                      {unlimited
                        ? 'Unlimited seats'
                        : `${event.seatsLeft ?? 0} of ${event.capacity} left`}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}