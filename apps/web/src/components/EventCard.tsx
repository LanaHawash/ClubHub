export type EventCardData = {
  id: string
  title: string
  imageUrl: string
  date: string
  time: string
  organizerName: string
}

type EventCardProps = {
  event: EventCardData
  onClick?: () => void
}

export default function EventCard({
  event,
  onClick,
}: EventCardProps) {
  return (
    <button
        type="button"
        onClick={onClick}
        className="overflow-hidden rounded-3xl border border-ink/10 bg-paper text-left shadow-sm transition hover:-translate-y-1"
        >
      <img
        src={event.imageUrl}
        alt=""
        className="h-28 w-full object-cover"
      />

      <div className="p-5">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-2">
          {event.date} · {event.time}
        </p>

        <p className="mt-1 font-display text-3xl leading-tight">
          {event.title}
        </p>

        <p className="mt-1 text-sm text-ink-2">
          {event.organizerName}
        </p>
      </div>
    </button>
  )
}