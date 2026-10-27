import { useEffect, useState } from 'react'
import { Check, LockKeyhole, Plus, Search, Trash2 } from 'lucide-react'

type BoardAppointment = {
  id: string
  studentId: string
  position: string
  startDate: string
  endDate: string | null
  endedAt?: string | null
  student: {
    fullName: string
    universityId: string
    email?: string | null
    account?: { profilePhotoUrl?: string | null } | null
  }
}

type Candidate = {
  id?: string
  studentId?: string
  fullName?: string
  universityId?: string
  account?: { profilePhotoUrl?: string | null } | null
  student?: { id?: string; fullName?: string; universityId?: string; account?: { profilePhotoUrl?: string | null } | null }
}

type Props = { clubId: string; accessToken: string }
const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const displayDate = (date: string | null) => date ? date.slice(0, 10) : 'Ongoing'
const isActive = (member: BoardAppointment) => !member.endedAt && member.startDate.slice(0, 10) <= today() && (!member.endDate || member.endDate.slice(0, 10) >= today())
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')

async function api<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  })
  if (!response.ok) {
    const result: { message?: string | string[] } = await response.json().catch(() => ({}))
    throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message || `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

function Avatar({ member }: { member: BoardAppointment }) {
  const photo = member.student.account?.profilePhotoUrl
  return (
    <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-lilac font-display text-lg text-ink">
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : initials(member.student.fullName)}
    </span>
  )
}

export default function BoardAppointmentsPanel({ clubId, accessToken }: Props) {
  const [current, setCurrent] = useState<BoardAppointment[]>([])
  const [history, setHistory] = useState<BoardAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editPosition, setEditPosition] = useState('')
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<{ studentId: string; name: string; universityId: string } | null>(null)
  const [position, setPosition] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  async function reload() {
    const [active, all] = await Promise.all([
      api<BoardAppointment[]>(`/api/clubs/${clubId}/board`, accessToken),
      api<BoardAppointment[]>(`/api/clubs/${clubId}/board/history`, accessToken),
    ])
    setCurrent(active.filter(isActive))
    setHistory(all)
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      api<BoardAppointment[]>(`/api/clubs/${clubId}/board`, accessToken),
      api<BoardAppointment[]>(`/api/clubs/${clubId}/board/history`, accessToken),
    ]).then(([active, all]) => {
      if (alive) { setCurrent(active.filter(isActive)); setHistory(all); setError('') }
    }).catch((reason: unknown) => {
      if (alive) setError(reason instanceof Error ? reason.message : 'Unable to load board.')
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [clubId, accessToken])

  useEffect(() => {
    if (!adding || selected || search.trim().length < 2) { setCandidates([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const results = await api<Candidate[] | { data: Candidate[] }>(
          `/api/students/board-candidates?search=${encodeURIComponent(search.trim())}`,
          accessToken,
          { signal: controller.signal },
        )
        if (!controller.signal.aborted) setCandidates(Array.isArray(results) ? results : results.data ?? [])
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to search students.')
      }
    }, 300)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [adding, selected, search, accessToken])

  async function perform(operation: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setSuccess('')
    try { await operation(); await reload(); window.dispatchEvent(new Event('clubhub:board-changed')); setSuccess(message); return true }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save board.'); return false }
    finally { setBusy(false) }
  }

  async function addMember() {
    if (!selected || !position.trim()) { setError('Select a registered student and enter a board position.'); return }
    const ok = await perform(
      () => api(`/api/clubs/${clubId}/board`, accessToken, {
        method: 'POST', body: JSON.stringify({ studentId: selected.studentId, position: position.trim(), startDate, ...(endDate ? { endDate } : {}) }),
      }), 'Board member added.',
    )
    if (ok) { setAdding(false); setSelected(null); setSearch(''); setCandidates([]); setPosition(''); setStartDate(today()); setEndDate('') }
  }

  async function savePosition(id: string) {
    if (!editPosition.trim()) { setError('Enter a position.'); return }
    const ok = await perform(
      () => api(`/api/board-appointments/${id}`, accessToken, { method: 'PUT', body: JSON.stringify({ position: editPosition.trim() }) }),
      'Board position updated.',
    )
    if (ok) setEditing(null)
  }

  async function endAppointment(member: BoardAppointment) {
    if (!window.confirm(`End ${member.student.fullName}'s board appointment immediately? Linked administrator access will be revoked.`)) return
    await perform(
      () => api(`/api/board-appointments/${member.id}/end`, accessToken, { method: 'PATCH', body: JSON.stringify({ endDate: today() }) }),
      'Appointment ended. Linked administrator access revoked.',
    )
  }

  return (
    <section className="rounded-3xl border border-ink/10 bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">Club board</h2>
          <p className="mt-2 text-sm text-ink-2">Board members are registered ClubHub students. Positions are assigned by Deanship.</p>
        </div>
        <button type="button" disabled={busy} onClick={() => { setAdding((value) => !value); setError(''); setSuccess('') }} className="inline-flex items-center gap-2 rounded-full border border-ink/25 px-4 py-2 text-sm font-semibold hover:bg-ink hover:text-paper disabled:opacity-50">
          <Plus size={16} /> Add board member
        </button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-soft p-3 text-sm text-[#8a1f47]">{error}</p>}
      {success && <p role="status" className="mt-4 inline-flex items-center gap-2 text-sm text-ink"><Check size={16} />{success}</p>}
      {adding && (
        <div className="mt-5 rounded-2xl border border-ink/10 bg-paper p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative sm:col-span-2">
              <label className="mb-1.5 block text-sm font-semibold" htmlFor="board-student-search">Search by student name or university ID</label>
              <div className="relative"><Search size={17} className="absolute left-3 top-3.5 text-ink-2" /><input id="board-student-search" value={search} onChange={(event) => { setSearch(event.target.value); setSelected(null) }} placeholder="Type a name or university ID" autoComplete="off" className="w-full rounded-xl border border-ink/20 bg-white py-3 pl-10 pr-4 outline-none focus:border-ink" /></div>
              {selected && <p className="mt-1 text-xs font-semibold text-ink-2">Selected: {selected.name} · {selected.universityId}</p>}
              {!selected && candidates.length > 0 && <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-ink/10 bg-white shadow-sm">{candidates.map((item) => {
                const student = item.student ?? item
                const studentId = item.studentId ?? student.id ?? item.id ?? ''
                const name = student.fullName ?? item.fullName ?? ''
                const universityId = student.universityId ?? item.universityId ?? ''
                return <li key={studentId}><button type="button" className="w-full px-4 py-3 text-left text-sm hover:bg-paper" onClick={() => { setSelected({ studentId, name, universityId }); setSearch(`${name} · ${universityId}`); setCandidates([]) }}>{name} · {universityId}</button></li>
              })}</ul>}
            </div>
            <label className="text-sm font-semibold">Role / position<input value={position} onChange={(event) => setPosition(event.target.value)} placeholder="e.g. Secretary" className="mt-1.5 w-full rounded-xl border border-ink/20 bg-white px-4 py-3 font-normal" /></label>
            <label className="text-sm font-semibold">Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-ink/20 bg-white px-4 py-3 font-normal" /></label>
            <label className="text-sm font-semibold">End date <span className="font-normal text-ink-2">(optional)</span><input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-ink/20 bg-white px-4 py-3 font-normal" /></label>
          </div>
          <div className="mt-4 flex gap-3"><button type="button" disabled={busy || !selected || !position.trim()} onClick={() => void addMember()} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-40">{busy ? 'Saving…' : 'Add member'}</button><button type="button" onClick={() => setAdding(false)} className="rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold">Cancel</button></div>
        </div>
      )}
      <div className="mt-5 divide-y divide-ink/10">
        {loading && <p className="py-4 text-sm text-ink-2">Loading board…</p>}
        {!loading && current.length === 0 && <p className="py-4 text-sm text-ink-2">No current board members.</p>}
        {!loading && current.map((member) => (
          <div key={member.id} className="flex flex-wrap items-center gap-3 py-4">
            <Avatar member={member} />
            <div className="min-w-0 flex-1"><p className="font-semibold">{member.student.fullName}</p><p className="text-xs text-ink-2">{member.student.universityId} · {displayDate(member.startDate)} – {displayDate(member.endDate)}</p>
              {editing === member.id ? <div className="mt-2 flex flex-wrap gap-2"><input aria-label="Board position" value={editPosition} onChange={(event) => setEditPosition(event.target.value)} className="rounded-xl border border-ink/20 bg-white px-3 py-2 text-sm" /><button type="button" disabled={busy} onClick={() => void savePosition(member.id)} className="rounded-full bg-ink px-3 py-2 text-xs font-semibold text-paper">Save</button><button type="button" onClick={() => setEditing(null)} className="rounded-full border border-ink/20 px-3 py-2 text-xs font-semibold">Cancel</button></div> : <p className="mt-1 text-sm text-ink-2">{member.position}</p>}
            </div>
            <div className="flex items-center gap-2"><button type="button" disabled={busy} onClick={() => { setEditing(member.id); setEditPosition(member.position) }} className="rounded-full border border-ink/20 px-3 py-2 text-xs font-semibold hover:bg-paper">Edit</button><button type="button" disabled={busy} onClick={() => void endAppointment(member)} aria-label={`End appointment for ${member.student.fullName}`} title="End board appointment" className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-ink/10"><Trash2 size={16} /></button></div>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-ink/10 pt-4">
        <button type="button" onClick={() => setShowHistory((value) => !value)} className="text-sm font-semibold text-ink underline underline-offset-4">{showHistory ? 'Hide board history' : 'View board history'}</button>
        {showHistory && <div className="mt-4 divide-y divide-ink/10">{history.filter((member) => !isActive(member)).length === 0 && <p className="text-sm text-ink-2">No past appointments yet.</p>}{history.filter((member) => !isActive(member)).map((member) => <div key={member.id} className="flex flex-wrap items-center gap-3 py-3"><Avatar member={member} /><div className="flex-1"><p className="text-sm font-semibold">{member.student.fullName} · {member.position}</p><p className="text-xs text-ink-2">{displayDate(member.startDate)} – {displayDate(member.endDate)}{member.endedAt ? ` · Removed ${new Date(member.endedAt).toLocaleString()}` : ''}</p></div>{!isActive(member) && <span className="rounded-full bg-paper-2 px-3 py-1 text-xs text-ink-2"><LockKeyhole size={12} className="mr-1 inline" />{member.endedAt ? 'Ended manually' : member.startDate.slice(0, 10) > today() ? 'Scheduled' : 'Expired'}</span>}</div>)}</div>}
      </div>
    </section>
  )
}
