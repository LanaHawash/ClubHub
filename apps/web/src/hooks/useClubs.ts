import { useEffect, useState } from 'react'

export type ClubScope = 'major' | 'faculty' | 'general'

export type Club = {
  id: string
  name: string
  description: string
  scope: ClubScope
  status: 'active'
  imageUrl?: string
}

type ApiClub = {
  id: string
  name: string
  description: string
  classification: 'GENERAL' | 'FACULTY_BASED' | 'MAJOR_BASED'
  status: 'ACTIVE'
  logoUrl: string | null
}

function mapClub(club: ApiClub): Club {
  const scope: ClubScope =
    club.classification === 'MAJOR_BASED'
      ? 'major'
      : club.classification === 'FACULTY_BASED'
        ? 'faculty'
        : 'general'

  return {
    id: club.id,
    name: club.name,
    description: club.description,
    scope,
    status: 'active',
    imageUrl: club.logoUrl || undefined,
  }
}

export function useClubs() {
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadClubs() {
      try {
        const response = await fetch('/api/clubs', {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error('Could not load clubs')
        }

        const data: ApiClub[] = await response.json()
        setClubs(data.map(mapClub))
      } catch (err) {
        if (controller.signal.aborted) return

        setError(
          err instanceof Error ? err.message : 'Something went wrong',
        )
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadClubs()

    return () => controller.abort()
  }, [])

  return { clubs, loading, error }
}