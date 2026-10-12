import { useState } from 'react'
import { Search } from 'lucide-react'
import ClubCard, { scopeLabel, useClubs, type ClubScope } from '../components/ClubCard'

const categories = [
  { id: 'all', label: 'All clubs' },
  { id: 'major', label: 'By major' },
  { id: 'faculty', label: 'By faculty' },
  { id: 'general', label: 'General interest' },
] as const

export default function Clubs() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'all' | ClubScope>('all')
  const { clubs, loading, error } = useClubs()

  const query = search.trim().toLowerCase()
  const filteredClubs = clubs.filter((club) => {
    const matchesCategory = category === 'all' || club.scope === category
    const matchesSearch = !query ||
      club.name.toLowerCase().includes(query) ||
      club.description.toLowerCase().includes(query)
    return matchesCategory && matchesSearch
  })

  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-14 sm:px-8">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">
        Directory
      </p>
      <h1 className="max-w-3xl font-display text-6xl leading-[0.95] sm:text-8xl">
        {loading ? 'Clubs.' : `${clubs.length} clubs.`}{' '}
        <em className="text-rose">One</em> is yours.
      </h1>

      <div className="mt-10 flex flex-col gap-4">
        <div className="relative max-w-xl">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-2" />
          <input
            type="search"
            aria-label="Search clubs"
            placeholder="Search clubs, majors, interests"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-2xl border border-ink/15 bg-card py-3 pl-11 pr-4 text-ink outline-none focus:border-ink"
          />
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.id)}
              aria-pressed={category === item.id}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold capitalize transition ${
                category === item.id
                  ? 'border-ink bg-ink text-paper'
                  : 'border-ink/20 hover:border-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="mt-10 text-ink-2">Loading clubs...</p>}
      {error && <p role="alert" className="mt-10 text-rose">{error}</p>}
      {!loading && !error && (
        filteredClubs.length ? (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClubs.map((club) => (
              <ClubCard
                key={club.id}
                club={{ ...club, scope: scopeLabel(club.scope) }}
              />
            ))}
          </div>
        ) : (
          <p className="mt-10 rounded-3xl border border-dashed border-ink/25 p-12 text-center text-ink-2">
            {clubs.length === 0
              ? 'No clubs available yet.'
              : 'No clubs match your search or filters.'}
          </p>
        )
      )}
    </div>
  )
}
