import { useEffect, useRef, useState } from 'react'

type Stat = {
  k: string
  v: number | string
  bg: string
}

type PinnedStatsProps = {
  stats: Stat[]
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches
  )

  useEffect(() => {
    const media = window.matchMedia(query)

    const update = () => setMatches(media.matches)

    media.addEventListener('change', update)

    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
}

function usePrefersReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

export default function PinnedStats({ stats }: PinnedStatsProps) {
  const ref = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const reduced = usePrefersReducedMotion()
  const desktop = useMediaQuery('(min-width: 1024px)')
  const pinned = desktop && !reduced

  useEffect(() => {
    if (!pinned) return

    let frameId = 0

    const update = () => {
      const el = ref.current
      const stage = stageRef.current

      if (!el || !stage) return

      const L = window.innerHeight * 0.5

      const s = Math.min(
        Math.max(
          112 + L * 0.4 - el.getBoundingClientRect().top,
          0
        ),
        L
      )

      el.style.setProperty('--p', (s / L).toFixed(4))

      stage.style.transform =
        `translateY(${(s * 0.6).toFixed(1)}px)`
    }

    const onScroll = () => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(update)
    }

    update()

    window.addEventListener('scroll', onScroll, {
      passive: true,
    })

    window.addEventListener('resize', onScroll)

    return () => {
      cancelAnimationFrame(frameId)

      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [pinned])

  if (!pinned) {
    return (
      <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((t) => (
          <div
            key={t.k}
            className={`rounded-3xl p-5 ${t.bg}`}
          >
            <p className="font-display text-6xl leading-none">
              {t.v}
            </p>

            <p className="mt-2 text-sm font-semibold">
              {t.k}
            </p>
          </div>
        ))}
      </div>
    )
  }

  return (
    <section
      ref={ref}
      aria-label="Your term at a glance"
      className="relative mt-6 pb-[30vh]"
      style={{ '--p': 0 } as React.CSSProperties}
    >
      <div
        ref={stageRef}
        className="will-change-transform"
      >
        <div className="grid grid-cols-4 gap-4">
          {stats.map((t, i) => (
            <div
              key={t.k}
              className="anim-rise"
              style={{
                animationDelay: `${i * 90}ms`,
                '--i': i,
              } as React.CSSProperties}
            >
              <div
                className={`pin-tile flex min-h-[19rem] flex-col justify-between rounded-3xl p-7 shadow-[0_18px_40px_-24px_rgba(26,16,40,0.45)] ${t.bg}`}
                style={{ '--i': i } as React.CSSProperties}
              >
                <p className="font-display text-9xl leading-none">
                  {t.v}
                </p>

                <p className="text-lg font-semibold">
                  {t.k}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}