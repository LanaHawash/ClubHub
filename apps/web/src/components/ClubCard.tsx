import { useEffect, useState } from 'react'
import { ArrowUpRight, Users } from 'lucide-react'

export type ClubScope = 'major' | 'faculty' | 'general'

export type ClubCardData = {
  id: string
  name: string
  description: string
  scope: string
  members?: number
  imageUrl?: string
  joiningFee?: number | null
  renewalFee?: number | null
}

export type Club = {
  id: string
  name: string
  description: string
  scope: ClubScope
  imageUrl?: string
}

type ApiClub = {
  id: string
  name: string
  description: string
  classification: 'GENERAL' | 'FACULTY_BASED' | 'MAJOR_BASED'
  status: 'ACTIVE' | 'ARCHIVED'
  logoUrl: string | null
}

export function scopeLabel(scope: ClubScope): string {
  return scope === 'major'
    ? 'By major'
    : scope === 'faculty'
      ? 'By faculty'
      : 'General interest'
}

// Shared by Home and Clubs so both pages use the same real API data.
export function useClubs() {
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadClubs() {
      try {
        setLoading(true)
        const response = await fetch('/api/clubs', { signal: controller.signal })
        if (!response.ok) throw new Error('Could not load clubs. Check that the API is running.')

        const result: ApiClub[] = await response.json()
        const active = result
          .filter((club) => club.status === 'ACTIVE')
          .map((club): Club => ({
            id: club.id,
            name: club.name,
            description: club.description,
            scope: club.classification === 'MAJOR_BASED'
              ? 'major'
              : club.classification === 'FACULTY_BASED'
                ? 'faculty'
                : 'general',
            imageUrl: club.logoUrl || undefined,
          }))
        if (!controller.signal.aborted) {
          setClubs(active)
          setError(null)
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Could not load clubs')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadClubs()
    return () => controller.abort()
  }, [])

  return { clubs, loading, error }
}

const acronymOverrides: Record<string, string> = {
  'Institute of Electrical and Electronics Engineers': 'IEEE',
}

export function getClubInitials(name: string): string {
  if (acronymOverrides[name]) return acronymOverrides[name]

  const ignored = new Set(['of', 'and', 'the'])
  return name
    .split(/\s+/)
    .filter((word) => word && !ignored.has(word.toLowerCase()))
    .map((word) => word[0].toUpperCase())
    .join('')
}

export const coverColors: Record<string, string> = {
  'Language Resource Center': 'bg-lilac',
  'Engineers Without Borders': 'bg-mint',
  'Institute of Electrical and Electronics Engineers': 'bg-butter',
  "Palestinian Medical Students' Association": 'bg-rose/30',
  "Medical Laboratory Students' Association": 'bg-paper-2',
}

function feeLabel(fee: number | null | undefined) {
  return fee == null ? 'TBD' : `${fee} ILS`
}

type ClubCardProps = {
  club: ClubCardData
  onClick?: () => void
  isPlaceholder?: boolean
}

export default function ClubCard({
  club,
  onClick,
  isPlaceholder = false,
}: ClubCardProps) {
  const initials = getClubInitials(club.name)
  const initialsSize = initials.length <= 2
    ? 'text-[8rem]'
    : initials.length === 3
      ? 'text-[6rem]'
      : 'text-[4.5rem]'

  return (
    <article onClick={onClick} className="group flex flex-col overflow-hidden rounded-3xl border border-ink/10 bg-card text-left transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className={`relative h-40 overflow-hidden ${coverColors[club.name] ?? 'bg-lilac'}`}>
        {club.imageUrl ? (
          <img src={club.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="relative h-full w-full overflow-hidden">
            <span
              aria-hidden="true"
              className={`absolute -bottom-6 -right-1 select-none font-display italic leading-none text-ink/90 ${initialsSize}`}
            >
              {initials}
            </span>
          </div>
        )}
        <div className="absolute right-3 top-3 z-10 rounded-xl bg-card/95 px-3 py-2 text-xs font-semibold text-ink shadow-sm">
          <p>Joining: {feeLabel(club.joiningFee)}</p>
          <p className="mt-1">Renewal: {feeLabel(club.renewalFee)}</p>
        </div>
        {isPlaceholder && (
          <span className="absolute left-3 top-3 rounded-full bg-butter px-3 py-1 text-xs font-semibold text-ink">
            Preview
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div>
          <span className="inline-flex rounded-full bg-paper-2 px-3 py-1 text-xs font-semibold text-ink">
            {club.scope}
          </span>
        </div>
        <h3 className="mt-3 font-display text-[1.7rem] leading-tight text-ink">
          {club.name}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm text-ink-2">{club.description}</p>

        <div className="mt-auto flex items-center justify-between pt-5">
          <span className="inline-flex items-center gap-2 text-sm text-ink-2">
            <Users size={16} aria-hidden="true" />
            {club.members === undefined ? 'Members TBD' : club.members}
          </span>
          {onClick ? (
            <button
              type="button"
              onClick={(event) => {
              event.stopPropagation()
              onClick?.()
            }}
              aria-label={`View ${club.name}`}
              className="grid size-9 place-items-center rounded-full bg-ink text-paper transition hover:bg-rose hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum"
            >
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          ) : (
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-ink/40 text-paper">
              <ArrowUpRight size={16} />
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
