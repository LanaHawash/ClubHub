import EventFeed from '../components/EventFeed'

export default function Events() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <main className="mx-auto max-w-7xl px-5 pb-24 pt-14 sm:px-8">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">
          Calendar
        </p>

        <h1 className="mb-10 font-display text-6xl leading-[0.95] sm:text-8xl">
          What's <em className="text-rose">on</em>
        </h1>

        <EventFeed events={[]} />
      </main>
    </div>
  )
}