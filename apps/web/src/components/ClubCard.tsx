import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, Lock, Users } from 'lucide-react'

export type ClubScope = 'major' | 'faculty' | 'general'
export type ClubBadgeStatus = 'member' | 'pending' | 'not-eligible' | null

export type ClubCardData = {
  id: string
  name: string
  description: string
  scope: string
  members?: number
  imageUrl?: string
  joiningFee?: number | null
  renewalFee?: number | null
  tone?: readonly [string, string]
}
export type Club = {
  id: string
  name: string
  description: string
  scope: ClubScope
  imageUrl?: string
  labels: string[]
  eligibleMajors: string[]
  facultyName: string | null
  members?: number
  joiningFee?: number | null
  renewalFee?: number | null
  tone: readonly [string, string]
}
type ApiClub = {
  id: string; name: string; description: string
  classification: 'GENERAL' | 'FACULTY_BASED' | 'MAJOR_BASED'
  status: 'ACTIVE' | 'ARCHIVED'; logoUrl: string | null
  faculty: { id: string; name: string } | null
  eligibleMajors: { major: { id: string; name: string } }[]
  labels: { label: { id: string; name: string } }[]
}
type PaginatedClubsResponse = {
  data: ApiClub[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}
// Kept for existing ClubPage.tsx compatibility; card covers use Figma tone pairs.
export const coverColors: Record<string, string> = {
  'Language Resource Center': 'bg-lilac',
  'Engineers Without Borders': 'bg-mint',
  'Institute of Electrical and Electronics Engineers': 'bg-butter',
  "Palestinian Medical Students' Association": 'bg-rose/30',
  "Medical Laboratory Students' Association": 'bg-paper-2',
}

export function scopeLabel(scope: ClubScope): string {
  return scope === 'major' ? 'By major' : scope === 'faculty' ? 'By faculty' : 'General interest'
}

// Color pairs copied from Figma's data.ts, never randomly generated at render time.
// The original demo clubs have their specified pair; new DB clubs use a deterministic pair.
const FIGMA_TONES = [
  ['#2a1744', '#f5d968'], ['#ef6c9c', '#1a1028'],
  ['#cdbcff', '#241539'], ['#a8e6cf', '#16342a'],
  ['#f5d968', '#241539'], ['#f9d3e1', '#5a1333'],
  ['#241539', '#ef6c9c'], ['#7a1f3d', '#f9d3e1'],
  ['#f5d968', '#1a1028'],
] as const
export function clubTone(clubId: string): readonly [string, string] {
  let hash = 0
  for (const char of clubId) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0
  return FIGMA_TONES[(hash >>> 0) % FIGMA_TONES.length]
}

// Shared by Home and Directory: keep live NestJS/PostgreSQL records.
export function useClubs() {
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        setLoading(true)
        const response = await fetch('/api/clubs?page=1&limit=100', { signal: controller.signal })
        if (!response.ok) throw new Error('Could not load clubs. Check that the API is running.')
        const first: PaginatedClubsResponse = await response.json()
        const all = [...first.data]
        for (let page = 2; page <= first.meta.totalPages; page++) {
          const next = await fetch(`/api/clubs?page=${page}&limit=100`, { signal: controller.signal })
          if (!next.ok) throw new Error('Could not load additional clubs.')
          const result: PaginatedClubsResponse = await next.json()
          all.push(...result.data)
        }
        const active = all.filter(c => c.status === 'ACTIVE').map((c): Club => ({
          id: c.id, name: c.name, description: c.description,
          scope: c.classification === 'MAJOR_BASED' ? 'major' : c.classification === 'FACULTY_BASED' ? 'faculty' : 'general',
          imageUrl: c.logoUrl || undefined,
          labels: (c.labels ?? []).map(x => x.label.name),
          eligibleMajors: (c.eligibleMajors ?? []).map(x => x.major.name),
          facultyName: c.faculty?.name ?? null,
          tone: clubTone(c.id),
        }))
        if (!controller.signal.aborted) { setClubs(active); setError(null) }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load clubs')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [])
  return { clubs, loading, error }
}

// Figma's original acronym/cover sizing behavior (no arbitrary letter color).
export function getClubInitials(name: string) {
  return name.split(/\s+/)
    .filter(w => /^[A-Za-z0-9]/.test(w) && !['of', 'the', 'and', 'for'].includes(w.toLowerCase()))
    .map(w => w[0]).join('').toUpperCase()
}

export function ClubCover({ club, className = '', big = false }: { club: ClubCardData; className?: string; big?: boolean }) {
  const [bg, fg] = club.tone ?? clubTone(club.id)
  const initials = getClubInitials(club.name)
  const size = big
    ? (initials.length <= 2 ? 'text-[16rem]' : initials.length === 3 ? 'text-[11rem]' : 'text-[8rem]')
    : (initials.length <= 2 ? 'text-[8rem]' : initials.length === 3 ? 'text-[6rem]' : 'text-[4.5rem]')
  return <div className={`relative isolate overflow-hidden ${className}`} style={{ background: bg, color: fg }}>
    {club.imageUrl && <img src={club.imageUrl} alt="" loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40 mix-blend-multiply" />}
    <span aria-hidden="true" className={`absolute -bottom-6 -right-1 select-none font-display italic leading-none opacity-90 ${size}`}>{initials}</span>
  </div>
}

// A badge is shown ONLY when the account is known to be a signed-in student.
// No fake membership or pending status: those await real membership APIs.
export function useClubEligibility(clubs: Pick<Club, 'id'>[], accessToken: string | null | undefined) {
  const [badges, setBadges] = useState<Record<string, ClubBadgeStatus>>({})
  const clubIds = clubs.map(c => c.id).join(',')
  useEffect(() => {
    setBadges({})
    if (!accessToken || !clubIds) return
    const controller = new AbortController()
    async function load() {
      const entries = await Promise.all(clubIds.split(',').map(async id => {
        try {
          const response = await fetch(`/api/clubs/${id}/eligibility/me`, {
            headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal,
          })
          if (!response.ok) return [id, null] as const
          const result: { eligible: boolean } = await response.json()
          return [id, result.eligible ? null : 'not-eligible'] as const
        } catch { return [id, null] as const }
      }))
      if (!controller.signal.aborted) setBadges(Object.fromEntries(entries))
    }
    void load()
    return () => controller.abort()
  }, [accessToken, clubIds])
  return badges
}

type ClubCardProps = {
  club: ClubCardData; onClick?: () => void; isPlaceholder?: boolean
  badgeStatus?: ClubBadgeStatus; i?: number
}
export default function ClubCard({ club, onClick, isPlaceholder = false, badgeStatus = null, i = 0 }: ClubCardProps) {
  const renewal = club.renewalFee
  return <button type="button" onClick={onClick} disabled={!onClick}
    style={{ animationDelay: `${i * 60}ms` }}
    className="anim-rise group flex w-full flex-col overflow-hidden rounded-3xl border border-ink/10 bg-card text-left transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(26,16,40,0.35)] disabled:cursor-default">
    <div className="relative">
      <ClubCover club={club} className="h-40" />
      <span className="absolute right-3 top-3 rounded-full bg-card/95 px-3 py-1 text-xs font-bold shadow-sm">
        {renewal === undefined || renewal === null ? 'Fee TBD' : renewal === 0 ? 'Free' : `from ${renewal} ILS`}
      </span>
      {isPlaceholder && <span className="absolute left-3 top-3 rounded-full bg-butter px-3 py-1 text-xs font-bold">Preview</span>}
    </div>
    <div className="flex flex-1 flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-paper-2 px-2.5 py-1 text-xs font-semibold">{club.scope}</span>
        {badgeStatus === 'member' && <span className="inline-flex items-center gap-1 rounded-full bg-mint px-2.5 py-1 text-xs font-semibold text-[#16342a]"><Check size={12} strokeWidth={3} /> Member</span>}
        {badgeStatus === 'pending' && <span className="inline-flex items-center gap-1 rounded-full bg-butter px-2.5 py-1 text-xs font-semibold">Pending</span>}
        {badgeStatus === 'not-eligible' && <span className="inline-flex items-center gap-1 rounded-full bg-ink/10 px-2.5 py-1 text-xs font-semibold"><Lock size={11} /> Not eligible</span>}
      </div>
      <h3 className="mt-3 font-display text-[1.7rem] leading-[1.05]">{club.name}</h3>
      <p className="mt-2 line-clamp-2 text-sm text-ink-2">{club.description}</p>
      <div className="mt-auto flex items-center justify-between pt-5 text-sm">
        <span className="inline-flex items-center gap-1.5 text-ink-2"><Users size={14} /> {club.members ?? 'Members TBD'}</span>
        <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-ink text-paper transition group-hover:bg-rose group-hover:text-ink"><ArrowUpRight size={16} /></span>
      </div>
    </div>
  </button>
}
