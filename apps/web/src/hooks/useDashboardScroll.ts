import { useEffect, useRef, useState } from 'react'

export function useDashboardScroll() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let frameId = 0

    const updateProgress = () => {
      const section = sectionRef.current
      if (!section) return

      const rect = section.getBoundingClientRect()
      const viewportHeight = window.innerHeight

      const totalDistance = viewportHeight + rect.height
      const traveled = viewportHeight - rect.top

      const nextProgress = Math.min(
        1,
        Math.max(0, traveled / totalDistance)
      )

      setProgress(nextProgress)
    }

    const handleScroll = () => {
      cancelAnimationFrame(frameId)

      frameId = requestAnimationFrame(updateProgress)
    }

    updateProgress()

    window.addEventListener('scroll', handleScroll, {
      passive: true,
    })

    window.addEventListener('resize', handleScroll)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [])

  return { sectionRef, progress }
}