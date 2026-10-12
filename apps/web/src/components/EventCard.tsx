export type EventCardData = {
  id: string
  title: string
  imageUrl?: string | null
  date: string
  time?: string | null
  organizerName: string
}

type EventCardProps = {
  event: EventCardData
  onClick?: () => void
}

function formatEventDate(dateString: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString)

  if (!match) return 'Date TBA'

  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])

  const date = new Date(Date.UTC(year, month, day))

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

export default function EventCard({ event, onClick }: EventCardProps) {
  const content = (
    <>
      {event.imageUrl ? (
        <img src={event.imageUrl} alt="" className="h-56 w-full object-cover" />
      ) : (
        <div aria-hidden="true" className="flex h-28 items-center justify-end overflow-hidden bg-lilac pr-5 font-display text-7xl italic text-ink">CH</div>
      )}
      <div className="p-6">
        <p className="font-mono text-xs tracking-widest text-ink-2">
  {formatEventDate(event.date)}
  {' · '}
  {event.time || 'Time TBA'}
</p>
        <p className="mt-2 font-display text-4xl leading-tight">{event.title}</p>
        <p className="mt-1 text-sm text-ink-2">{event.organizerName}</p>
      </div>
    </>
  )

  const className = 'overflow-hidden rounded-3xl border border-ink/10 bg-paper text-left shadow-sm transition hover:-translate-y-1'
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>{content}</button>
  ) : (
    <article className={className}>{content}</article>
  )
}
