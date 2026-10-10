import { useState } from 'react'
import { Search } from 'lucide-react'

type Club = {
  id: string
  name: string
  description: string
  scope: 'major' | 'faculty' | 'general'
  status: 'active' | 'inactive'
  members: number
  imageUrl?: string
}

export default function Clubs() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<
    'all' | 'major' | 'faculty' | 'general'
  >('all')

  // TODO(API): Replace with club records fetched from the backend.
    const clubs: Club[] = []

    // Only active clubs appear in the directory and count toward the heading.
    const activeClubs = clubs.filter((club) => club.status === 'active')

    const filteredClubs = activeClubs.filter((club) => {
  const matchesCategory =
    category === 'all' || club.scope === category

  const query = search.trim().toLowerCase()

  const matchesSearch =
    query === '' ||
    club.name.toLowerCase().includes(query) ||
    club.description.toLowerCase().includes(query)

  return matchesCategory && matchesSearch
})
  const categories = [
    { id: 'all', label: 'All clubs' },
    { id: 'major', label: 'By major' },
    { id: 'faculty', label: 'By faculty' },
    { id: 'general', label: 'General interest' },
  ] as const

  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-14 sm:px-8">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">
        Directory
      </p>

      <h1 className="max-w-3xl font-display text-6xl leading-[0.95] sm:text-8xl">
        {activeClubs.length} clubs. <em className="text-rose">One</em> is yours.
        </h1>

      <div className="mt-10 flex flex-col gap-4">
        <div className="relative max-w-xl">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-2"
          />

          <input
            type="search"
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

      {filteredClubs.length === 0 && (
        <p className="mt-10 rounded-3xl border border-dashed border-ink/25 p-12 text-center text-ink-2">
            {activeClubs.length === 0
            ? 'No clubs available yet.'
            : 'No clubs match your search or filters.'}
        </p>
        )}
    </div>
  )
}