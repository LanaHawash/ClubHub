import { useState } from 'react'

export type EventType =
  | 'Competition'
  | 'Performance'
  | 'Talk'
  | 'Workshop'
  | 'Social'
  | 'Seminar'
  | 'Campaign'
  | 'Conference'
  | 'Volunteering'
  | 'Other'

export type EventFeedData = {
  id: string
  title: string
  type: EventType
  date: string
  endDate?: string | null
  startTime?: string | null
  clubId?: string
  registrationOpen?: boolean
  registrationDeadline?: string | null
  eligibility?: string
  isFree?: boolean
  memberFee?: string | number
  nonMemberFee?: string | number
  currency?: string
  imageUrl?: string | null
  location: string
  organizerName: string
  fee?: number | null
  capacity?: number | null
  seatsLeft?: number | null
  description?: string
  sourceUrl?: string | null
}

type EventFeedProps = {
  events: EventFeedData[]
  onEventClick?: (id: string) => void
  limit?: number
  emptyMessage?: string
  sortOrder?: 'asc' | 'desc'
  isPast?: boolean
}

const types: (EventType | 'All')[] = [
  'All', 'Competition', 'Performance', 'Talk', 'Workshop', 'Social',
  'Seminar', 'Campaign', 'Conference', 'Volunteering', 'Other',
]

const TYPE_TONE: Record<EventType, string> = {
  Workshop: 'bg-mint text-[#16342a]',
  Competition: 'bg-butter text-ink',
  Talk: 'bg-lilac text-plum',
  Social: 'bg-rose-soft text-[#8a1f47]',
  Performance: 'bg-ink text-paper',
  Seminar: 'bg-lilac text-plum',
  Campaign: 'bg-rose-soft text-[#8a1f47]',
  Conference: 'bg-butter text-ink',
  Volunteering: 'bg-mint text-[#16342a]',
  Other: 'bg-paper-2 text-ink',
}

function dayParts(value: string) {
  // The API stores a date-only value. Parse the calendar date directly to avoid
  // shifting it backward/forward in browsers with different timezones.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month, day, 12))
  return { day, month: date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }), weekday: date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }) }
}

export default function EventFeed({
  events,
  onEventClick,
  limit = 5,
  emptyMessage = 'Nothing scheduled here yet. Check back soon.',
  sortOrder = 'asc',
  isPast = false,
}: EventFeedProps) {
  const [type, setType] = useState<EventType | 'All'>('All')
  const availableTypes = types.filter((item) => item === 'All' || events.some((event) => event.type === item))

  const filteredEvents = events
    .filter((event) => type === 'All' || event.type === type)
    .slice()
    .sort((a, b) => (sortOrder === 'asc' ? 1 : -1) * a.date.localeCompare(b.date))
    .slice(0, limit)

  return (
    <div>
      <div className="no-scrollbar mb-6 flex gap-2 overflow-x-auto" role="group" aria-label="Filter events by type">
        {availableTypes.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={type === item}
            onClick={() => setType(item)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              type === item ? 'border-ink bg-ink text-paper' : 'border-ink/20 hover:border-ink'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 && (
        <p className="rounded-3xl border border-dashed border-ink/25 p-10 text-center text-ink-2">
          {emptyMessage}
        </p>
      )}

      <ul className="divide-y divide-ink/15 border-y border-ink/15">
        {filteredEvents.map((event) => {
          const parts = dayParts(event.date)
          const hasCapacity = event.capacity != null && event.capacity > 0
          const hasPrice = event.isFree != null || event.fee != null || event.nonMemberFee != null
          const priceLabel = event.isFree === true || event.fee === 0
            ? 'Free'
            : event.nonMemberFee != null
              ? `${event.nonMemberFee} ${event.currency ?? 'ILS'}`
              : event.fee != null ? `${event.fee} ${event.currency ?? 'ILS'}` : null
          const percentage = hasCapacity && event.seatsLeft != null
            ? Math.min(100, Math.max(0, ((event.capacity! - event.seatsLeft) / event.capacity!) * 100))
            : 0
          const sourceLink = !onEventClick && event.sourceUrl && /^https:\/\//i.test(event.sourceUrl)
          const cardClass = 'group grid w-full grid-cols-[4.5rem_1fr] items-center gap-x-5 gap-y-3 py-6 text-left transition hover:bg-card/70 sm:grid-cols-[6rem_8rem_1fr_auto] sm:px-3'
          const content = (
            <>
              <div className="text-center">
                {isPast && (
                  <p className="mb-1 font-mono text-xs font-semibold tracking-widest text-rose">
                    {event.date.slice(0, 4)}
                  </p>
                )}
                <p className="font-display text-5xl leading-none sm:text-6xl">{parts?.day ?? 'â€”'}</p>
                <p className="font-mono text-[11px] uppercase tracking-widest text-ink-2">
                  {parts ? `${parts.month} آ· ${parts.weekday}` : 'Date TBA'}
                </p>
              </div>

              {event.imageUrl ? (
                <img src={event.imageUrl} alt="" loading="lazy" className="hidden aspect-[4/3] w-full rounded-2xl object-cover sm:block" />
              ) : (
                <div aria-hidden="true" className="hidden aspect-[4/3] w-full place-items-center rounded-2xl bg-lilac font-display text-3xl italic text-ink sm:grid">
                  CH
                </div>
              )}

              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TYPE_TONE[event.type]}`}>{event.type}</span>
                </div>
                <h3 className="font-display text-3xl leading-tight group-hover:underline group-hover:decoration-rose group-hover:underline-offset-4">
                  {event.title}
                </h3>
                <p className="mt-1 text-sm text-ink-2">
                  {event.location ? `${event.location} آ· ` : ''}{event.organizerName}
                </p>
                {event.description && <p className="mt-2 line-clamp-2 text-sm text-ink-2">{event.description}</p>}
              </div>

              <div className="col-span-2 flex items-center justify-between gap-6 sm:col-span-1 sm:flex-col sm:items-end sm:gap-3">
                {!isPast && hasPrice ? (
                  <>
                    <p className="font-display text-3xl">{priceLabel}</p>
                    <div className="w-28">
                      <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                        <div className="h-full rounded-full bg-rose" style={{ width: `${percentage}%` }} />
                      </div>
                      <p className="mt-1 text-right text-xs text-ink-2">
                        {hasCapacity
                          ? event.seatsLeft == null ? 'Seat counts coming soon' : `${event.seatsLeft} of ${event.capacity} left`
                          : 'Unlimited seats'}
                      </p>
                    </div>
                  </>
                ) : (
                  <span className="text-xs text-ink-2">{isPast && event.sourceUrl ? 'Official report ↗' : 'Event details'}</span>
                )}
              </div>
            </>
          )
          return (
            <li key={event.id}>
              {onEventClick ? (
                <button type="button" onClick={() => onEventClick(event.id)} className={cardClass}>{content}</button>
              ) : sourceLink ? (
                <a href={event.sourceUrl!} target="_blank" rel="noopener noreferrer" className={cardClass}>{content}</a>
              ) : (
                <div className={cardClass}>{content}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}