import { useEffect, useState } from 'react'

type Student = { studentId: string; name: string; universityId: string }
type RawCandidate = { id?: string; studentId?: string; fullName?: string; universityId?: string; student?: { id?: string; fullName?: string; universityId?: string } }
type Props = { accessToken: string; selected: Student | null; onSelect: (student: Student | null) => void }
export default function StudentBoardPicker({ accessToken, selected, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RawCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (selected || query.trim().length < 2) { setResults([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('')
      try {
        const response = await fetch(`/api/students/board-candidates?search=${encodeURIComponent(query.trim())}`, { signal: controller.signal, headers: { Authorization: `Bearer ${accessToken}` } })
        if (!response.ok) throw new Error(`Unable to search students (${response.status})`)
        const data: RawCandidate[] | { data: RawCandidate[] } = await response.json()
        if (!controller.signal.aborted) setResults(Array.isArray(data) ? data : data.data ?? [])
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to find students.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, 300)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [query, selected, accessToken])
  return <div className="relative min-w-0 sm:h-full">
    <input aria-label="Search board member by name or university ID" autoComplete="off" placeholder="Name or university ID" value={selected ? `${selected.name} · ${selected.universityId}` : query} onChange={(e) => { if (selected) onSelect(null); setQuery(e.target.value) }} className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3 outline-none focus:border-ink focus:ring-4 focus:ring-rose/25 sm:h-full" />
    {selected && <button type="button" aria-label={`Clear ${selected.name}`} onClick={() => { onSelect(null); setQuery('') }} className="mt-1 text-xs font-semibold text-ink-2 underline sm:absolute sm:bottom-2 sm:left-4">Change student</button>}
    {loading && <p className="mt-1 text-xs text-ink-2">Searching…</p>}
    {error && <p role="alert" className="mt-1 text-xs text-rose">{error}</p>}
    {!selected && results.length > 0 && <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-ink/15 bg-white shadow-lg">{results.map((record) => {
      const person = record.student ?? record
      const studentId = record.studentId ?? person.id ?? record.id ?? ''
      const name = person.fullName ?? record.fullName ?? ''
      const universityId = person.universityId ?? record.universityId ?? ''
      return <li key={studentId}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => { onSelect({ studentId, name, universityId }); setQuery(''); setResults([]) }}>{name} · {universityId}</button></li>
    })}</ul>}
  </div>
}
