import { useEffect, useRef } from 'react'
import type { EventFeedData } from './EventFeed'

type Props = {
  event: EventFeedData | null
  isPast: boolean
  isSignedIn: boolean
  onSignIn: () => void
  onClose: () => void
}

function prettyDate(value?: string | null) {
  if (!value) return 'To be announced'
  const isoDate = value.slice(0, 10)
  const date = new Date(`${isoDate}T12:00:00Z`)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export default function EventModal({ event, isPast, isSignedIn, onSignIn, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!event) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
    }
  }, [event, onClose])

  if (!event) return null

  const deadlinePassed = event.registrationDeadline
    ? new Date(`${event.registrationDeadline}T23:59:59+03:00`).getTime() < Date.now()
    : false
  const capacity = event.capacity
  const seatsLeft = event.seatsLeft
  const hasCapacity = capacity != null && capacity > 0
  const used = hasCapacity && seatsLeft != null ? Math.max(0, capacity - seatsLeft) : 0
  const occupancy = hasCapacity ? Math.min(100, Math.round((used / capacity) * 100)) : 0
  const canRegister = !isPast && event.registrationOpen && !deadlinePassed && (seatsLeft == null || seatsLeft > 0)
  const isFree = event.isFree !== false
  const fee = isFree ? 'Free' : 'Paid event'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="event-modal-title" className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-card p-6 text-ink shadow-2xl sm:rounded-3xl sm:p-8">
        <button ref={closeRef} onClick={onClose} aria-label="Close event details" className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-paper-2 text-xl hover:bg-ink hover:text-paper">×</button>
        {event.imageUrl ? <img src={event.imageUrl} alt="" className="-mx-6 -mt-6 mb-6 h-52 w-[calc(100%+3rem)] max-w-none rounded-t-3xl object-cover sm:-mx-8 sm:-mt-8 sm:w-[calc(100%+4rem)]" /> : <div aria-hidden="true" className="-mx-6 -mt-6 mb-6 grid h-52 place-items-center rounded-t-3xl bg-lilac font-display text-7xl italic sm:-mx-8 sm:-mt-8">CH</div>}
        <div className="flex flex-wrap gap-2"><span className="rounded-full bg-rose-soft px-3 py-1 text-xs font-semibold">{event.type}</span><span className="rounded-full bg-paper-2 px-3 py-1 text-xs font-semibold">{event.organizerName}</span></div>
        <h2 id="event-modal-title" className="mt-3 font-display text-4xl leading-tight">{event.title}</h2>
        <p className="mt-3 whitespace-pre-line text-ink-2">{event.description || 'Event details will be announced.'}</p>
        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div className="rounded-2xl bg-paper p-3"><dt className="text-xs text-ink-2">Date</dt><dd className="mt-1 font-semibold">{prettyDate(event.date)}{event.endDate && event.endDate !== event.date ? ` – ${prettyDate(event.endDate)}` : ''}</dd></div>
          <div className="rounded-2xl bg-paper p-3"><dt className="text-xs text-ink-2">Starts</dt><dd className="mt-1 font-semibold">{event.startTime || 'To be announced'}</dd></div>
          <div className="rounded-2xl bg-paper p-3"><dt className="text-xs text-ink-2">Where</dt><dd className="mt-1 font-semibold">{event.location || 'To be announced'}</dd></div>
          <div className="rounded-2xl bg-paper p-3"><dt className="text-xs text-ink-2">Availability</dt><dd className="mt-1 font-semibold">{hasCapacity ? `${seatsLeft == null ? capacity : seatsLeft} seats left` : 'Unlimited seats'}</dd></div>
        </dl>
        {event.registrationDeadline && !isPast && <p className="mt-4 text-sm text-ink-2">Registration closes {prettyDate(event.registrationDeadline)}.</p>}
        {hasCapacity && <div className="mt-4"><div className="h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-rose" style={{ width: `${occupancy}%` }} /></div><p className="mt-1 text-right text-xs text-ink-2">{seatsLeft == null ? 'Live reservations are not connected yet' : `${seatsLeft} of ${capacity} seats left`}</p></div>}
        <div className="mt-6 border-t border-ink/10 pt-6">
          {isPast ? <p className="text-sm text-ink-2">This event has ended. Registration is closed.</p>
            : !event.registrationOpen ? <p className="text-sm text-ink-2">Registration is not open.</p>
            : deadlinePassed ? <p className="text-sm text-ink-2">Registration is closed.</p>
            : !isSignedIn ? <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-display text-3xl">{fee}</p><p className="text-sm text-ink-2">Sign in with your university account to register.</p></div><button onClick={() => { onClose(); onSignIn() }} className="rounded-full bg-ink px-6 py-3 font-semibold text-paper hover:bg-plum-2">Sign in to reserve your seat</button></div>
            : canRegister ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-display text-3xl">{fee}</p><button type="button" disabled title="Reservations will become available once the registration API is connected" className="rounded-full bg-ink px-6 py-3 font-semibold text-paper opacity-50">Reserve my seat · Coming soon</button></div>
            : <p className="text-sm text-ink-2">Event full.</p>}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper p-4"><div><p className="text-xs uppercase tracking-widest text-ink-2">Organised by</p><p className="font-semibold">{event.organizerName}</p></div><button disabled title="Club profile pages are coming soon" className="rounded-full border border-ink/20 px-4 py-2 text-sm text-ink-2">View club · Coming soon</button></div>
        {isPast && event.sourceUrl && <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-semibold text-rose underline">Read official report ↗</a>}
      </section>
    </div>
  )
}
