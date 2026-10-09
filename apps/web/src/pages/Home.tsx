import { useEffect, useState } from 'react'
import { ArrowRight, Clock, MapPin, ChevronLeft,ChevronRight,Megaphone, } from 'lucide-react'
import featuredEvent from '../assets/hack.jpg'
import featuredEvent1 from '../assets/club.webp'


type HomeProps = {
  onSignIn: () => void
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

export default function Home({ onSignIn }: HomeProps) {
  const [activeIndex, setActiveIndex] = useState(0)
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
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-6">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-full bg-ink font-display text-lg italic text-butter"
            >
              CH
            </span>

            <span className="font-display text-2xl">ClubHub</span>
          </div>

          <nav
            aria-label="Main navigation"
            className="ml-6 hidden items-center gap-1 md:flex"
            >
            <a
                href="#home"
                aria-current="page"
                className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper"
            >
                Home
            </a>

            <a
                href="#clubs"
                className="rounded-full px-4 py-2 text-sm font-semibold transition-colors hover:bg-ink/10"
            >
                Clubs
            </a>

            <a
                href="#events"
                className="rounded-full px-4 py-2 text-sm font-semibold transition-colors hover:bg-ink/10"
            >
                Events
            </a>
            </nav>

          <button
            type="button"
            onClick={onSignIn}
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper transition-colors hover:bg-plum-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum ml-auto"
          >
            Sign in
          </button>
          
        </div>
      </header>

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
</main>
    </div>
  )
}
