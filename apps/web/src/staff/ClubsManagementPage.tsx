import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Trash2 } from 'lucide-react'
import StudentBoardPicker from './StudentBoardPicker'
import ClubLabelsPicker from './ClubLabelsPicker'
import type { ClubLabelsSelection } from './ClubLabelsPicker'
type ClubClassification = 'GENERAL' | 'FACULTY_BASED' | 'MAJOR_BASED'
type Club = {
  id: string
  name: string
  classification: ClubClassification
  status: 'ACTIVE' | 'ARCHIVED'
  contactEmail: string
  description: string
  logoUrl: string | null
  foundedYear: number | null
  faculty: { id: string; name: string } | null
  eligibleMajors: { major: { id: string; name: string } }[]
  supervisorId: string | null
  supervisor: {
    id: string
    fullName: string
  } | null
}
type Faculty = { id: string; name: string }
type Major = { id: string; name: string; facultyId: string }
type BoardMember = { studentId: string; name: string; universityId: string; role: string; startDate: string; endDate: string }
type Supervisor = {
  id: string
  fullName: string
  account?: {
    status: string
    role: string
  }
}

function eligibilityLabel(club: Club): string{
  if (club.classification === 'GENERAL') return 'All students'
  if (club.classification === 'FACULTY_BASED') {
    return club.faculty?.name ?? 'Faculty notspecified'
  }
  const majors = club.eligibleMajors.map((item) => item.major.name)
  return majors.length ? majors.join(', ') : 'No eligible majors specified'
}

type ClubsManagementPageProps = {
  accessToken: string
  onClubSelect: (clubId: string) => void
}
type PaginatedClubsResponse = {
  data: Club[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

async function fetchAllClubs(
  accessToken: string,
  signal?: AbortSignal,
): Promise<Club[]> {
  const allClubs: Club[] = []

  let page = 1
  let totalPages = 1

  do {
    const response = await fetch(
      `/api/clubs/admin/all?page=${page}&limit=100`,
      {
        signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    if (!response.ok) {
      throw new Error(
        `Unable to load clubs (${response.status}).`,
      )
    }

    const result: PaginatedClubsResponse =
      await response.json()

    allClubs.push(...result.data)

    totalPages = result.meta.totalPages
    page++
  } while (page <= totalPages)

  return allClubs
}

export default function ClubsManagementPage({
  accessToken,
  onClubSelect,
}: ClubsManagementPageProps) {
  const [clubs, setClubs] = useState<Club[]>([])
 
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddClub, setShowAddClub] = useState(false)
  const [editingClubId, setEditingClubId] = useState<string | null>(null)
  const [classification, setClassification] =useState<ClubClassification>('GENERAL')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [foundedYear, setFoundedYear] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

 
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [majors, setMajors] = useState<Major[]>([])
  const [universityDataLoading, setUniversityDataLoading] = useState(true)
  const [universityDataError, setUniversityDataError] = useState('')
  const [facultyId, setFacultyId] = useState('')
  const [selectedMajorIds, setSelectedMajorIds] = useState<string[]>([])

  const [clubLabels, setClubLabels] = useState<ClubLabelsSelection>({
    labelIds: [],
    newLabels: [],
  })

  const [board, setBoard] = useState<BoardMember[]>([
    { studentId: '', name: '', universityId: '', role: 'President', startDate: new Date().toISOString().slice(0, 10), endDate: '' },
    { studentId: '', name: '', universityId: '', role: 'Vice President', startDate: new Date().toISOString().slice(0, 10), endDate: '' },
  ])
  const [boardAdmins, setBoardAdmins] = useState<string[]>(['', ''])
  const [firstFee, setFirstFee] = useState('')
  const [renewalFee, setRenewalFee] = useState('')
  const [windowEnabled, setWindowEnabled] = useState(false)
  const [windowStart, setWindowStart] = useState('')
  const [windowEnd, setWindowEnd] = useState('')
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [supervisorId, setSupervisorId] = useState('')
  const [supervisorsLoading, setSupervisorsLoading] = useState(true)
  const [supervisorsError, setSupervisorsError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    async function loadClubs() {
      setLoading(true)
      setError('')
      try {
      const data = await fetchAllClubs(
        accessToken,
        controller.signal,
      )
        if (!controller.signal.aborted) {
          setClubs(data)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to load clubs.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadClubs()
    return () => controller.abort()
  }, [])
// Sprint 3.4: Load supervisors for club assignments.


  useEffect(() => {
    const controller = new AbortController()
    async function loadUniversityData() {
      setUniversityDataLoading(true)
      setUniversityDataError('')
      try {
        const [facultiesResponse, majorsResponse] = await Promise.all([
          fetch('/api/university/faculties', { signal: controller.signal }),
          fetch('/api/university/majors', { signal: controller.signal }),
        ])
        if (!facultiesResponse.ok || !majorsResponse.ok) {
          throw new Error('Unable to load university faculties and majors.')
        }
        const facultiesData: Faculty[] = await facultiesResponse.json()
        const majorsData: Major[] = await majorsResponse.json()
        if (!controller.signal.aborted) {
          setFaculties(facultiesData)
          setMajors(majorsData)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setUniversityDataError(
            err instanceof Error ? err.message : 'Unable to load university data.',
          )
        }
      } finally {
        if (!controller.signal.aborted) setUniversityDataLoading(false)
      }
    }
    void loadUniversityData()
    return () => controller.abort()
  }, [])

  useEffect(() => {
  const controller = new AbortController()

  async function loadSupervisors() {
    setSupervisorsLoading(true)
    setSupervisorsError('')

    try {
      const response = await fetch('/api/supervisors', {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        throw new Error(
          `Unable to load supervisors (${response.status}).`
        )
      }

      const data: Supervisor[] = await response.json()

      if (!controller.signal.aborted) {
        setSupervisors(
          data.filter(
            (supervisor) =>
              supervisor.account?.status === 'ACTIVE'
          )
        )
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setSupervisorsError(
          error instanceof Error
            ? error.message
            : 'Unable to load supervisors.'
        )
      }
    } finally {
      if (!controller.signal.aborted) {
        setSupervisorsLoading(false)
      }
    }
  }

  void loadSupervisors()

  return () => controller.abort()
}, [accessToken])

  function openAddClub() {
    setEditingClubId(null)
    setClassification('GENERAL')
    setName('')
    setDescription('')
    setContactEmail('')
    setLogoUrl('')
    setFoundedYear('')
    setFormError('')
    setFacultyId('')
    setSelectedMajorIds([])
    setShowAddClub(true)
    setClubLabels({
      labelIds: [],
      newLabels: [],
    })
    setSupervisorId('')
    setBoard([{ studentId: '', name: '', universityId: '', role: 'President', startDate: new Date().toISOString().slice(0, 10), endDate: '' }, { studentId: '', name: '', universityId: '', role: 'Vice President', startDate: new Date().toISOString().slice(0, 10), endDate: '' }])
    setBoardAdmins(['', ''])
    setFirstFee('')
    setRenewalFee('')
    setWindowEnabled(false)
    setWindowStart('')
    setWindowEnd('')
  }

 
  async function saveClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setFormError('')
    if (!name.trim() || !description.trim() || !contactEmail.trim()) {
      setFormError('Name, description and contact email are required.')
      return
    }
    if (classification === 'FACULTY_BASED' &&!facultyId) {
      setFormError('Choose a faculty for a faculty-based club.')
      return
    }
    if (classification === 'MAJOR_BASED' && !selectedMajorIds.length) {
      setFormError('Select at least one major.')
      return
    }
    if (classification !== 'GENERAL' && (universityDataLoading || universityDataError)) {
      setFormError('University data is unavailable. Try again after it loads.')
      return
    }
    const year = foundedYear.trim() ? Number(foundedYear) : undefined
    if (year !== undefined && (!Number.isInteger(year) || year < 1800 || year > 2100)) {
      setFormError('Founded year must be between 1800 and 2100.')
      return
    }
    const selectedBoard = board.filter((member) => member.studentId)
    if (!selectedBoard.length || selectedBoard.some((member) => !member.role.trim())) {
      setFormError('Select at least one registered board member and enter each position.')
      return
    }
    if (new Set(selectedBoard.map((m) => m.studentId)).size !== selectedBoard.length) {
      setFormError('The same student cannot be added twice to the board.')
      return
    }
    if (selectedBoard.some((member) => member.endDate && member.endDate < member.startDate)) {
      setFormError('Board end dates cannot precede their start dates.')
      return
    }
    const adminIndexes = boardAdmins.map((id) => board.findIndex((m) => m.studentId === id))
    if (adminIndexes[0] >= 0 && adminIndexes[0] === adminIndexes[1]) {
      setFormError('Select two different board members for administrator slots.')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(editingClubId ? `/api/clubs/${editingClubId}` : '/api/clubs', {
        method: editingClubId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          contactEmail: contactEmail.trim().toLowerCase(),
          classification,
          labelIds: clubLabels.labelIds,
          newLabels: clubLabels.newLabels,
          facultyId: classification === 'FACULTY_BASED' ? facultyId : null,
          eligibleMajorIds: classification === 'MAJOR_BASED' ? selectedMajorIds : [],
          supervisorId: supervisorId || null,
          boardMembers: selectedBoard.map(({ studentId, role, startDate, endDate }) => ({
            studentId, position: role.trim(), startDate, ...(endDate ? { endDate } : {}),
          })),
          administrators: boardAdmins.flatMap((id, slot) => {
            const boardIndex = selectedBoard.findIndex((member) => member.studentId === id)
            return boardIndex < 0 ? [] : [{ boardIndex, position: slot === 0 ? 'PRESIDENT' : 'SECOND_ADMIN' }]
          }),
          ...(editingClubId
            ? { logoUrl: logoUrl.trim() || null, foundedYear: year ?? null }
            : {
                ...(logoUrl.trim() && { logoUrl: logoUrl.trim() }),
                ...(year !== undefined && { foundedYear: year }),
              }),
        }),
      })
      if (!response.ok) {
        const body: { message?: string | string[] } = await response.json().catch(() => ({}))
        const detail = Array.isArray(body.message) ? body.message.join(' ') : body.message
        throw new Error(detail || `Unable to save club (${response.status}).`)
      }
     try {
      const list = await fetchAllClubs(accessToken)
      setClubs(list)
      setError('')
    } catch {
      setError(
        'Club saved, but the club list could not be refreshed. Reload the page.',
      )
    }
      setShowAddClub(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save club.')
    } finally {
      setSaving(false)
    }
  }

// Sprint 3.3: Separate active and archived clubs.
const activeClubs = clubs.filter(
  (club) => club.status === 'ACTIVE'
)

const archivedClubs = clubs.filter(
  (club) => club.status === 'ARCHIVED'
)

const visibleClubs =
  statusFilter === 'ACTIVE'
    ? activeClubs
    : archivedClubs

// Sprint 3.3: Archive or reactivate a club.
 

// Sprint 3.4: Assign or reassign a club supervisor.
 


  return (
    <section className="mx-auto max-w-5xl anim-rise">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">Clubs</p>
          <h1 className="font-display text-5xl leading-tight sm:text-6xl">Every club</h1>
          <p className="mt-3 max-w-xl text-ink-2">Manage the university's clubs and their information.</p>
        </div>
        <button type="button" onClick={openAddClub} className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper transition hover:bg-plum-2">
          <Plus size={17} aria-hidden="true" /> Add club
        </button>
      </div>

      {/* Sprint 3.3: Active and Archived filters */}
<div className="mb-6 flex gap-2">

  <button
    type="button"
    onClick={() => setStatusFilter('ACTIVE')}
    aria-pressed={statusFilter === 'ACTIVE'}
    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
      statusFilter === 'ACTIVE'
        ? 'bg-ink text-paper'
        : 'bg-ink/5 text-ink-2 hover:bg-ink/10'
    }`}
  >
    Active · {activeClubs.length}
  </button>

  <button
    type="button"
    onClick={() => setStatusFilter('ARCHIVED')}
    aria-pressed={statusFilter === 'ARCHIVED'}
    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
      statusFilter === 'ARCHIVED'
        ? 'bg-ink text-paper'
        : 'bg-ink/5 text-ink-2 hover:bg-ink/10'
    }`}
  >
    Archived · {archivedClubs.length}
  </button>

</div>

      {error && <p role="alert" className="mb-5 rounded-2xl border border-rose/20 bg-rose/10 p-4 text-sm text-rose">{error}</p>}
      <div className="overflow-x-auto rounded-3xl border border-ink/10 bg-card">
        <table className="w-full min-w-[40rem] text-left text-sm">
  <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-ink-2">
    <tr>
      <th className="p-4 font-semibold">Club</th>
      <th className="p-4 font-semibold">Supervisor</th>
      <th className="p-4 font-semibold">Members</th>
      <th className="p-4 font-semibold">Adminaccount</th>
    </tr>
  </thead>

  <tbody className="divide-y divide-ink/10">
    {loading && (
      <tr>
        <td colSpan={4} className="p-6 text-center text-ink-2">
          Loading clubs...
        </td>
      </tr>
    )}

    {!loading && !error && visibleClubs.length === 0 && (
      <tr>
        <td colSpan={4} className="p-6 text-center text-ink-2">
          No {statusFilter.toLowerCase()} clubs found.
        </td>
      </tr>
    )}

    {!loading &&
      !error &&
      visibleClubs.map((club) => (
        <tr
          key={club.id}
          onClick={() => onClubSelect(club.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onClubSelect(club.id)
            }
          }}
          tabIndex={0}
          aria-label={`Manage ${club.name}`}
          className="cursor-pointer transition hover:bg-paper focus-visible:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-plum"
        >
          <td className="p-4">
            <p className="font-semibold text-ink">
              {club.name}
            </p>

            <p className="mt-1 max-w-sm text-xs text-ink-2">
              {eligibilityLabel(club)}
            </p>
          </td>

          <td className="p-4 text-sm text-ink-2">
            {club.supervisor?.fullName ?? 'Not assigned'}
          </td>

          <td className="p-4 text-sm text-ink-2">
            —
          </td>

          <td className="p-4 text-xs text-ink-2">
            Not created yet
          </td>
        </tr>
      ))}
  </tbody>
</table>
      </div>

      {showAddClub && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAddClub(false) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="club-form-title" className="anim-pop relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-card p-6 shadow-2xl sm:rounded-3xl sm:p-8">
            <button type="button" onClick={()=> setShowAddClub(false)} aria-label="Close" className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-paper-2 hover:bg-ink hover:text-paper"><X size={16} /></button>
            <h2 id="club-form-title" className="pr-8 font-display text-4xl leading-tight">Add a club</h2>
            <form onSubmit={saveClub}>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="mb-1.5 block text-sm font-semibold">Club name</span><input required minLength={2} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3 outline-none focus:border-ink focus:ring-4 focus:ring-rose/25" /></label>
                <label className="block"><span className="mb-1.5 block text-sm font-semibold">Supervisor</span><select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} disabled={supervisorsLoading || saving} className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3 outline-none focus:border-ink focus:ring-4 focus:ring-rose/25"><option value="">Choose…</option>{supervisors.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select>{supervisorsError && <span role="alert" className="text-xs text-rose">{supervisorsError}</span>}</label>
              </div>
              <p className="mb-2 mt-6 text-sm font-semibold">Who can join</p>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Clubcategory">
                {([
                  ['MAJOR_BASED', 'Major club', 'Only chosen majors'],
                  ['FACULTY_BASED', 'Faculty club', 'One whole faculty'],
                  ['GENERAL', 'University-wide club', 'Every student'],
                ] as const).map(([value, title, subtitle]) => (
                  <button key={value} type="button" role="radio" aria-checked={classification === value} onClick={() => setClassification(value)} className={'rounded-2xl border-2 p-3 text-left transition ' + (classification === value ? 'border-ink bg-paper' : 'border-ink/15 hover:border-ink/40')}><span className="block font-semibold">{title}</span><span className="text-xs text-ink-2">{subtitle}</span></button>
                ))}
              </div>
              {classification === 'GENERAL' && <p className="mt-3 text-sm text-ink-2">Everystudent is eligible, so there is nothing elseto choose.</p>}
              {classification !== 'GENERAL' && universityDataError && <p role="alert" className="mt-3 text-sm text-rose">{universityDataError}</p>}
              {classification !== 'GENERAL' && universityDataLoading && <p className="mt-3 text-sm text-ink-2">Loading university data…</p>}
              {classification === 'FACULTY_BASED' && <label className="mt-3 block max-w-sm"><span className="mb-1.5 block text-sm font-semibold">Which faculty is it for?</span><select value={facultyId} onChange={(e) => setFacultyId(e.target.value)} className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3"><option value="">Choose a faculty…</option>{faculties.map((f) => <option value={f.id} key={f.id}>{f.name}</option>)}</select></label>}
              {classification === 'MAJOR_BASED' && (
                <div className="mt-3 rounded-2xl bg-paper p-4">
                  <p className="mb-3 text-sm font-semibold">Which majors can join?</p>
                  <div
                    role="group"
                    aria-label="Available faculties and majors"
                    tabIndex={0}
                    className="max-h-80 space-y-3 overflow-y-auto overscroll-contain pr-2"
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    {faculties.map((faculty) => (
                      <div key={faculty.id}>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-2">
                          {faculty.name}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {majors.filter((major) => major.facultyId === faculty.id).map((major) => (
                            <button
                              key={major.id}
                              type="button"
                              aria-pressed={selectedMajorIds.includes(major.id)}
                              onClick={() => setSelectedMajorIds((prev) => prev.includes(major.id) ? prev.filter((id) => id !== major.id): [...prev, major.id])}
                              className={'rounded-full border px-3 py-1.5 text-sm font-semibold ' + (selectedMajorIds.includes(major.id) ? 'border-ink bg-ink text-paper' : 'border-ink/20 hover:border-ink')}
                            >
                              {major.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="mb-2 mt-6 text-sm font-semibold">Board</p>
              <div className="space-y-2">
                <div className="hidden grid-cols-[1.5fr_1fr_1fr_2.5rem] gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-ink-2 sm:grid"><span>Name / university ID</span><span>Role</span><span>Term</span><span /></div>
                {board.map((member, index) => (
                  <div key={index} className="grid gap-2 border-b border-ink/10 pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[1.5fr_1fr_1fr_2.5rem] sm:items-stretch">
                    <StudentBoardPicker accessToken={accessToken} selected={member.studentId ? { studentId: member.studentId, name: member.name, universityId: member.universityId } : null} onSelect={(student) => {
                      setBoard((items) => items.map((item, i) => i === index ? { ...item, studentId: student?.studentId ?? '', name: student?.name ?? '', universityId: student?.universityId ?? '' } : item))
                      setBoardAdmins((slots) => slots.map((id) => id === member.studentId ? '' : id))
                    }} />
                    <input aria-label="Board position" placeholder="Role, e.g. President" value={member.role} onChange={(event) => setBoard((items) => items.map((item, i) => i === index ? { ...item, role: event.target.value } : item))} className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3" />
                    <div className="space-y-1"><input type="date" aria-label="Start date" value={member.startDate} onChange={(event) => setBoard((items) => items.map((item, i) => i === index ? { ...item, startDate: event.target.value } : item))} className="w-full rounded-xl border border-ink/20 bg-white px-2 py-2 text-sm" /><input type="date" aria-label="End date (optional)" title="Optional end date" min={member.startDate} value={member.endDate} onChange={(event) => setBoard((items) => items.map((item, i) => i === index ? { ...item, endDate: event.target.value } : item))} className="w-full rounded-xl border border-ink/20 bg-white px-2 py-2 text-sm" /></div>
                    <button type="button" aria-label="Remove member" onClick={() => { setBoard((items) => items.filter((_, i) => i !== index)); setBoardAdmins((slots) => slots.map((id) => id === member.studentId ? '' : id)) }} className="grid size-11 place-items-center rounded-full text-ink-2 hover:bg-ink/10"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setBoard((items) => [...items, { studentId: '', name: '', universityId: '', role: '', startDate: new Date().toISOString().slice(0, 10), endDate: '' }])} className="mt-3 inline-flex items-center gap-2 rounded-full border border-ink/25 px-3.5 py-1.5 text-sm font-semibold hover:bg-ink hover:text-paper"><Plus size={15} />Add board member</button>
              <div className="mt-5 border-t border-ink/10 pt-4"><p className="text-sm font-semibold">Who manages the club?</p><p className="mb-3 text-xs text-ink-2">Choose up to two people from the board above. Administrators receive access only while their board appointment is current.</p>
                <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((slot) => <label key={slot} className="block"><span className="mb-1.5 block text-sm font-semibold">{slot === 0 ? 'Club administrator 1 · President' : 'Club administrator 2 · Second Administrator'}</span><select value={boardAdmins[slot]} onChange={(event) => setBoardAdmins((values) => values.map((value, index) => index === slot ? event.target.value : value))} className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3"><option value="">Choose from the board…</option>{board.filter((member) => member.studentId && member.studentId !== boardAdmins[1 - slot]).map((member) => <option key={member.studentId} value={member.studentId}>{member.name} · {member.universityId} · {member.role}</option>)}</select></label>)}</div>
              </div>
              <div className="mt-4 max-w-sm"><label className="block"><span className="mb-1.5 block text-sm font-semibold">Club contact email</span><input type="email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="name@clubs.uni.edu" className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3" /></label><p className="mt-1 text-xs text-ink-2">A contact address for the club; administrator access uses individual student accounts.</p></div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">{[['First-time fee ($)', firstFee, setFirstFee], ['Renewal fee ($)', renewalFee, setRenewalFee]].map(([label, val, setter]) => <label key={label as string} className="block"><span className="mb-1.5 block text-sm font-semibold">{label as string}</span><input type="number" min="0" value={val as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)} className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3" /></label>)}</div>
              <p className="mb-2 mt-6 text-sm font-semibold">Membership registration window<span className="font-normal text-ink-2">(optional)</span></p>
              <div className="inline-flex rounded-full border border-ink/15 p-0.5 text-sm font-semibold"><button type="button" aria-pressed={!windowEnabled} onClick={() => setWindowEnabled(false)} className={'rounded-full px-4 py-1.5 ' + (!windowEnabled ? 'bg-ink text-paper': 'text-ink-2')}>Any time</button><button type="button" aria-pressed={windowEnabled} onClick={() => setWindowEnabled(true)} className={'rounded-full px-4 py-1.5 ' + (windowEnabled ? 'bg-ink text-paper' : 'text-ink-2')}>Set a window</button></div>
              {windowEnabled && <div className="mt-3 grid max-w-md gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Opens<input type="date" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="mt-1 w-full rounded-xl border border-ink/20 bg-white px-4 py-3" /></label><label className="text-sm font-semibold">Closes<input type="date" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="mt-1 w-full rounded-xl border border-ink/20 bg-white px-4 py-3" /></label></div>}
              <details className="mt-5 rounded-xl border border-ink/10 px-4 py-3"><summary className="cursor-pointer text-sm font-semibold">Additional club information required by ClubHub</summary><label className="mt-3 block"><span className="mb-1.5 block text-sm font-semibold">Description</span><textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3" /></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Logo URL<input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="mt-1 w-full rounded-xl border border-ink/20 bg-white px-4 py-3" /></label><label className="text-sm font-semibold">Founded year<input type="number" min="1800" max="2100" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value)} className="mt-1 w-full rounded-xl border border-ink/20 bg-white px-4 py-3" /></label></div></details>
              <ClubLabelsPicker value={clubLabels} onChange={setClubLabels} disabled={saving} />
              {formError && <p role="alert" className="mt-4 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#8a1f47]">{formError}</p>}
              <button type="submit" disabled={saving} className="mt-6 inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-40">{saving ? 'Saving...' : 'Create club'}</button>
              <p className="mt-2 text-xs text-ink-2">Board appointments and administrator selections are saved with the club. Membership fees and registration windows are not yet persisted.</p>
            </form>
          </div>
        </div>, document.body
      )}

    </section>
  )
}