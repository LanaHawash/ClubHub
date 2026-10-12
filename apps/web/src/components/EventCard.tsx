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

export default function EventCard({ event, onClick }: EventCardProps) {
  const content = (
    <>
      {event.imageUrl ? (
        <img src={event.imageUrl} alt="" className="h-28 w-full object-cover" />
      ) : (
        <div aria-hidden="true" className="flex h-28 items-center justify-end overflow-hidden bg-lilac pr-5 font-display text-7xl italic text-ink">CH</div>
      )}
      <div className="p-5">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-2">
          {event.date}{event.time ? ` · ${event.time}` : ''}
        </p>
        <p className="mt-1 font-display text-3xl leading-tight">{event.title}</p>
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
