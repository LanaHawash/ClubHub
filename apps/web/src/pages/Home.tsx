import { useEffect, useState } from 'react'
import { ArrowRight, Clock, MapPin, ChevronLeft,ChevronRight,Megaphone, } from 'lucide-react'
import featuredEvent from '../assets/hack.jpg'
import featuredEvent1 from '../assets/club.webp'
import ClubCard from '../components/ClubCard'
import EventCard from '../components/EventCard'
import EventFeed from '../components/EventFeed'


type HomeProps = {
  onSignIn: () => void
  onEvents: () => void
}

const featuredEvents = [
  {
    id: 'hackathon',
    title: 'Hack the Quad: 24 Hours',
    description:
      'Teams of four, one theme, and a day of building ideas together.',
    dateLabel: '14 October',
    time: '18:00',
    day: '14',
    month: 'October',
    location: 'Innovation Hub',
    image: featuredEvent,
  },
  {
    id: 'club-fair',
    title: 'Find Your Club',
    description:
      'Meet student clubs and discover a community that shares your interests.',
    dateLabel: '20 October',
    time: '10:00',
    day: '20',
    month: 'October',
    location: 'University Courtyard',
    image: featuredEvent1,
  },
]

export default function Home({ onSignIn, onEvents }: HomeProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState<
    'major' | 'faculty' | 'general'
  >('major')
    const [isPlaying, setIsPlaying] = useState(true)

    useEffect(() => {
    if (!isPlaying) return

    const timer = window.setInterval(() => {
        setActiveIndex((previous) => (previous + 1) % featuredEvents.length)
    }, 7000)

  return () => window.clearInterval(timer)
    }, [isPlaying])
        const featuredEventData = featuredEvents[activeIndex]

        function changeSlide(direction: number) {
             
            setActiveIndex(
                (previous) =>
                (previous + direction + featuredEvents.length) %
                featuredEvents.length,
        )
        }
    return (
    <div id="home" className="min-h-screen bg-paper text-ink">

      <main>
<section
        className="grain relative overflow-hidden bg-plum text-white"
        onMouseEnter={() => setIsPlaying(false)}
        onMouseLeave={() => setIsPlaying(true)}
        onFocusCapture={() => setIsPlaying(false)}
        onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
            setIsPlaying(true)
            }
        }}
      >
        <div
      aria-hidden="true"
      className="absolute -left-40 top-10 size-[36rem] rounded-full bg-rose/25 blur-3xl"
    />

    <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-6 py-20 lg:grid-cols-[1.1fr_1fr]">    
        <div>
      <div key={featuredEventData.id} className="anim-rise max-w-2xl">
        <p className="mb-6 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-butter">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-butter"
          />
         Featured · {activeIndex + 1}/{featuredEvents.length}
        </p>

        <h1 className="font-display text-6xl leading-tight sm:text-7xl">
           {featuredEventData.title}
        </h1>

        <p className="mt-6 max-w-lg text-lg text-white/75">
            {featuredEventData.description}        </p>

        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm text-white/80">
          <span className="inline-flex items-center gap-2">
            <Clock size={16} aria-hidden="true" className="text-rose" />
            {featuredEventData.dateLabel} · {featuredEventData.time}
          </span>

          <span className="inline-flex items-center gap-2">
            <MapPin size={16} aria-hidden="true" className="text-rose" />
            {featuredEventData.location}
          </span>
        </div>

        <button
          type="button"
          onClick={onSignIn}
          className="mt-9 inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 font-semibold transition-colors hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-butter"
        >
          Student sign-in
          <ArrowRight size={18} aria-hidden="true" />
          
        </button>
        </div>
        <div className="mt-12 flex items-center gap-4">
        <button
            type="button"
            aria-label="Previous featured event"
            onClick={() => changeSlide(-1)}
            className="grid size-11 place-items-center rounded-full border border-white/30 transition-colors hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-butter"
        >
            <ChevronLeft size={18} aria-hidden="true" />
        </button>

        <button
            type="button"
            aria-label="Next featured event"
            onClick={() => changeSlide(1)}
            className="grid size-11 place-items-center rounded-full border border-white/30 transition-colors hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-butter"
        >
            <ChevronRight size={18} aria-hidden="true" />
        </button>
         

  <div className="ml-2 flex gap-2">
    {featuredEvents.map((event, index) => (
      <button
        key={event.id}
        type="button"
        aria-label={`Show ${event.title}`}
        aria-pressed={index === activeIndex}
        onClick={() => {
             
            setActiveIndex(index)
        }}
        className={`h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-butter ${
          index === activeIndex
            ? 'w-10 bg-butter'
            : 'w-4 bg-white/30 hover:bg-white/60'
        }`}
      />
    ))}
  </div>
</div>
</div>
     
      <div key={`image-${featuredEventData.id}`} className="anim-pop relative mx-auto w-full max-w-md lg:max-w-none">
  <div className="relative overflow-hidden rounded-t-[12rem] rounded-b-3xl">
    <img
      src={featuredEventData.image}
      alt="Students taking part in a university event"
      className="aspect-[4/5] w-full object-cover"
    />
    


    <div
      aria-hidden="true"
      className="absolute inset-0 bg-gradient-to-t from-plum/60 to-transparent"
    />
    
  </div>
        <div className="absolute -left-3 bottom-10 -rotate-4 rounded-2xl bg-butter px-5 py-3 text-ink shadow-xl sm:-left-6">
        <p className="font-display text-5xl leading-none">
            {featuredEventData.day}
        </p>

        <p className="mt-1 font-mono text-xs uppercase tracking-widest">
            {featuredEventData.month}
        </p>
        </div>
        </div>
    </div>
    </section>
    <section className="border-b border-line bg-paper-2/60 py-10">
    <div className="mx-auto max-w-7xl px-6">
        <h2 className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-ink-2">
        <Megaphone size={16} aria-hidden="true" />
        Announcements from the clubs
        </h2>

        <div  tabIndex={0}
        aria-label="Club announcements"
        className="no-scrollbar flex gap-4 overflow-x-auto pb-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum">
        <article className="flex min-h-48 w-72 shrink-0 flex-col rounded-2xl bg-butter p-5 sm:w-80">
            <p className="text-xs font-bold uppercase tracking-wider">
            Engineering Club
            </p>
            <h3 className="mt-3 font-display text-2xl leading-tight">
            New members welcome
            </h3>
            <p className="mt-auto pt-4 text-xs text-ink-2">
            Sample announcement
            </p>
        </article>

        <article className="flex min-h-48 w-72 shrink-0 flex-col rounded-2xl bg-lilac p-5">
            <p className="text-xs font-bold uppercase tracking-wider">
            Arts Club
            </p>
            <h3 className="mt-3 font-display text-2xl leading-tight">
            Share your creative ideas
            </h3>
            <p className="mt-auto pt-4 text-xs text-ink-2">
            Sample announcement
            </p>
        </article>

        <article className="flex min-h-48 w-72 shrink-0 flex-col rounded-2xl bg-mint p-5">
            <p className="text-xs font-bold uppercase tracking-wider">
            Volunteer Club
            </p>
            <h3 className="mt-3 font-display text-2xl leading-tight">
            Make a difference together
            </h3>
            <p className="mt-auto pt-4 text-xs text-ink-2">
            Sample announcement
            </p>
        </article>
        </div>
    </div>
    </section>
    {/* Club discovery section */}
<section
  id="clubs"
  className="relative overflow-hidden bg-paper pt-10 pb-16 md:pt-14"
>
  <div className="relative z-10 mx-auto max-w-7xl px-5 sm:px-8">

    <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-rose">
      Find your club
    </p>

    <h2 className="max-w-3xl font-display text-5xl leading-tight text-ink sm:text-6xl lg:text-8xl">
      Three ways to{' '}
      <em className="text-rose">belong</em>
    </h2>

    <div
      className="mt-10 grid gap-3 sm:grid-cols-3"
      aria-label="Club categories"
    >
      {(
        [
          {
            id: 'major',
            number: '01',
            title: 'By major',
            description: 'Clubs built around one discipline.',
          },
          {
            id: 'faculty',
            number: '02',
            title: 'By faculty',
            description: 'Communities for a whole faculty.',
          },
          {
            id: 'general',
            number: '03',
            title: 'General interest',
            description: 'Open to every student on campus.',
          },
        ] as const
      ).map((category) => {
        const isSelected = selectedCategory === category.id

        return (
          <button
            key={category.id}
            type="button"
            onClick={() => setSelectedCategory(category.id)}
            aria-pressed={isSelected}
            className={`rounded-2xl border-2 p-5 text-left transition-colors ${
              isSelected
                ? 'border-ink bg-ink text-paper'
                : 'border-ink/15 bg-transparent text-ink hover:border-ink/50'
            }`}
          >
            <span className="font-mono text-xs opacity-60">
              {category.number}
            </span>

            <h3 className="mt-1 font-display text-3xl">
              {category.title}
            </h3>

            <p
              className={`mt-2 text-sm ${
                isSelected ? 'text-paper/70' : 'text-ink-2'
              }`}
            >
              {category.description}
            </p>
          </button>
        )
      })}
    </div>
    {/* Club discovery results */}
    <div className="mt-8">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {import.meta.env.DEV && (
          <ClubCard
            isPlaceholder
            club={{
              id: 'preview-club',
              name: 'Club name',
              description: 'Club description will appear here.',
              scope: 'By major',
              members: 0,
            }}
          />
        )}
      </div>
      {!import.meta.env.DEV && (
      <div className="rounded-3xl border border-dashed border-ink/20 bg-paper-2/40 px-6 py-14 text-center">
        <h3 className="font-display text-3xl text-ink">
          No clubs to display yet
        </h3>

        <p className="mx-auto mt-3 max-w-md text-sm text-ink-2">
          Club information will appear here once it is available
          from ClubHub.
        </p>
      </div>
      )}
    </div>

  </div>
  </section>

  {/* Upcoming Events */}
  {/* Events feed — Figma layout */}
  <section id="events" className="bg-card">
    <div className="mx-auto max-w-7xl px-5 sm:px-8">

      <div className="pb-6 pt-20 md:pt-24">

        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">
          Events feed
        </p>

        <h2 className="max-w-3xl font-display text-5xl leading-[0.92] text-ink md:text-7xl xl:text-8xl">
          Coming up{' '}
          <em className="text-rose">on campus</em>
        </h2>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
  {import.meta.env.DEV ? (
    <EventCard
      event={{
        id: 'event-preview',
        title: 'Upcoming Campus Workshop',
        imageUrl: featuredEvent,
        date: 'Event date',
        time: 'Event time',
        organizerName: 'Organizing club',
      }}
    />
  ) : (
    <p className="text-sm text-ink-2">
      No upcoming events available.
    </p>
  )}
</div>

      </div>

    </div>
  </section>
  {/* Event feed — structure from Figma Home.tsx */}
<section className="bg-card pb-16 pt-6">
  <div className="mx-auto max-w-7xl px-5 sm:px-8">

    <div className="mb-6 flex justify-end">
  <button
    type="button"
    onClick={onEvents}
    className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum"
  >
    Full calendar
    <ArrowRight size={16} aria-hidden="true" />
  </button>
</div>

    <EventFeed events={[]} />

  </div>
</section>



</main>
    </div>
  )
}
