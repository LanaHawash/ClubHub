import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Plus, X } from 'lucide-react'

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
}
type Faculty = { id: string; name: string }
type Major = { id: string; name: string; facultyId: string }

function eligibilityLabel(club: Club): string {
  if (club.classification === 'GENERAL') return 'All students'
  if (club.classification === 'FACULTY_BASED') {
    return club.faculty?.name ?? 'Faculty not specified'
  }
  const majors = club.eligibleMajors.map((item) => item.major.name)
  return majors.length ? majors.join(', ') : 'No eligible majors specified'
}

type ClubsManagementPageProps = { accessToken: string }

export default function ClubsManagementPage({ accessToken }: ClubsManagementPageProps) {
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddClub, setShowAddClub] = useState(false)
  const [editingClubId, setEditingClubId] = useState<string | null>(null)
  const [classification, setClassification] = useState<ClubClassification>('GENERAL')
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

  const [facultyListOpen, setFacultyListOpen] = useState(false)
  const [majorPickerOpen, setMajorPickerOpen] = useState(false)
  const [draftMajorIds, setDraftMajorIds] = useState<string[]>([])
  const [majorSearch, setMajorSearch] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function loadClubs() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/clubs', { signal: controller.signal })
        if (!response.ok) throw new Error('Unable to load clubs.')
        const data: Club[] = await response.json()
        if (!controller.signal.aborted) setClubs(data)
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
    setFacultyListOpen(false)
    setMajorPickerOpen(false)
    setShowAddClub(true)
  }

  function openEditClub(club: Club) {
    setEditingClubId(club.id)
    setClassification(club.classification)
    setName(club.name)
    setDescription(club.description)
    setContactEmail(club.contactEmail)
    setLogoUrl(club.logoUrl ?? '')
    setFoundedYear(club.foundedYear?.toString() ?? '')
    setFacultyId(club.faculty?.id ?? '')
    setSelectedMajorIds(club.eligibleMajors.map((entry) => entry.major.id))
    setFormError('')
    setFacultyListOpen(false)
    setMajorPickerOpen(false)
    setShowAddClub(true)
  }

  function openMajorPicker() {
    setDraftMajorIds([...selectedMajorIds])
    setMajorSearch('')
    setMajorPickerOpen(true)
  }

  async function saveClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setFormError('')
    if (!name.trim() || !description.trim() || !contactEmail.trim()) {
      setFormError('Name, description and contact email are required.')
      return
    }
    if (classification === 'FACULTY_BASED' && !facultyId) {
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
          facultyId: classification === 'FACULTY_BASED' ? facultyId : null,
          eligibleMajorIds: classification === 'MAJOR_BASED' ? selectedMajorIds : [],
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
      const listResponse = await fetch('/api/clubs')
      if (listResponse.ok) {
        const list: Club[] = await listResponse.json()
        setClubs(list)
        setError('')
      } else {
        setError('Club saved, but the club list could not be refreshed. Reload the page.')
      }
      setShowAddClub(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save club.')
    } finally {
      setSaving(false)
    }
  }

  const selectedFaculty = faculties.find((faculty) => faculty.id === facultyId)
  const selectedMajors = selectedMajorIds
    .map((id) => majors.find((major) => major.id === id))
    .filter((major): major is Major => major !== undefined)

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

      <div className="mb-6 flex gap-2">
        <span className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper">Active · {clubs.length}</span>
        <span className="rounded-full bg-ink/5 px-4 py-2 text-sm font-semibold text-ink-2 opacity-60" title="Archived clubs will be available in Story 3.3">Archived</span>
      </div>
      {error && <p role="alert" className="mb-5 rounded-2xl border border-rose/20 bg-rose/10 p-4 text-sm text-rose">{error}</p>}
      <div className="overflow-x-auto rounded-3xl border border-ink/10 bg-card">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-ink-2">
            <tr><th className="p-4 font-semibold">Club</th><th className="p-4 font-semibold">Supervisor</th><th className="p-4 font-semibold">Members</th><th className="p-4 font-semibold">Admin account</th><th className="p-4 font-semibold">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {loading && <tr><td colSpan={5} className="p-6 text-center text-ink-2">Loading clubs...</td></tr>}
            {!loading && !error && clubs.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-ink-2">No active clubs found.</td></tr>}
            {!loading && !error && clubs.map((club) => (
              <tr key={club.id} className="transition hover:bg-paper">
                <td className="p-4"><p className="font-semibold">{club.name}</p><p className="mt-1 max-w-sm text-xs text-ink-2">{eligibilityLabel(club)}</p></td>
                <td className="p-4 text-ink-2">Not assigned yet</td>
                <td className="p-4 text-ink-2">—</td>
                <td className="p-4 text-xs text-ink-2">Not created yet</td>
                <td className="p-4"><button type="button" onClick={() => openEditClub(club)} className="rounded-full border border-ink/20 px-4 py-2 text-xs font-semibold hover:bg-ink/5">Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddClub && createPortal(
        <div className="fixed inset-y-0 right-0 left-0 z-50 flex items-center justify-center overflow-hidden bg-ink/60 p-3 sm:p-5 lg:left-[17rem]">
          <div role="dialog" aria-modal="true" aria-labelledby="club-form-title" className="w-full max-w-3xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain rounded-3xl bg-paper p-6 shadow-2xl sm:max-h-[calc(100dvh-2.5rem)] sm:p-8" style={{ scrollbarWidth: 'thin', scrollbarColor: '#8b7c96 transparent' }}>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-widest text-rose">Club management</p>
                <h2 id="club-form-title" className="font-display text-4xl text-ink">{editingClubId ? 'Edit club' : 'Add a club'}</h2>
                <p className="mt-2 text-sm text-ink-2">{editingClubId ? 'Update this club without changing its ID or events.' : 'Create a new university club.'}</p>
              </div>
              <button type="button" onClick={() => setShowAddClub(false)} aria-label="Close club form" className="rounded-full border border-ink/20 p-2 hover:bg-ink/5"><X size={19} /></button>
            </div>
            <form id="club-form" onSubmit={saveClub} className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Club name</span>
                <input type="text" required minLength={2} maxLength={150} value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter club name" className="w-full rounded-xl border border-line bg-card px-4 py-3 outline-none focus:border-plum focus:ring-2 focus:ring-plum/20" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Description</span>
                <textarea required rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does this club do?" className="w-full resize-y rounded-xl border border-line bg-card px-4 py-3 outline-none focus:border-plum focus:ring-2 focus:ring-plum/20" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Contact email</span>
                <input required type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="club@example.edu" className="w-full rounded-xl border border-line bg-card px-4 py-3 outline-none focus:border-plum focus:ring-2 focus:ring-plum/20" />
              </label>
              <details className="rounded-2xl border border-ink/10 bg-card p-4">
                <summary className="cursor-pointer text-sm font-semibold">Additional club details (optional)</summary>
                <div className="mt-4 grid gap-4">
                  <label className="block"><span className="mb-2 block text-sm font-semibold">Logo URL</span><input type="url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://..." className="w-full rounded-xl border border-line bg-paper px-4 py-3" /></label>
                  <label className="block"><span className="mb-2 block text-sm font-semibold">Founded year</span><input type="number" min={1800} max={2100} value={foundedYear} onChange={(event) => setFoundedYear(event.target.value)} className="w-full rounded-xl border border-line bg-paper px-4 py-3" /></label>
                </div>
              </details>
              <div className="rounded-2xl border border-dashed border-ink/20 bg-card p-5">
                <p className="text-sm font-semibold">Supervisor</p>
                <p className="mt-2 text-sm text-ink-2">Supervisor assignment will be available in Story 3.4.</p>
                <select disabled className="mt-3 w-full rounded-xl border border-line bg-paper px-4 py-3 text-ink-2 opacity-60"><option>Assign supervisor later</option></select>
              </div>
              <div className="rounded-2xl border border-ink/10 bg-card p-5">
                <p className="text-sm font-semibold text-ink">Who can join?</p>
                <p className="mt-2 text-sm text-ink-2">Choose which university students are eligible to join this club.</p>
                <div role="group" aria-label="Club eligibility classification" className="mt-4 grid gap-3 sm:grid-cols-3">
                  {([
                    { value: 'GENERAL', label: 'University-wide', description: 'All university students' },
                    { value: 'FACULTY_BASED', label: 'Faculty-based', description: 'Every major in one faculty' },
                    { value: 'MAJOR_BASED', label: 'Major-based', description: 'Specific selected majors' },
                  ] as const).map((option) => {
                    const selected = classification === option.value
                    return (
                      <button key={option.value} type="button" aria-pressed={selected} onClick={() => { setClassification(option.value); setFacultyListOpen(false) }}
                        className={`rounded-2xl border-2 p-3 text-left transition ${selected ? 'border-ink bg-paper text-ink' : 'border-ink/15 text-ink hover:border-ink/40'}`}>
                        <span className="block text-sm font-semibold">{option.label}</span>
                        <span className="mt-1 block text-xs text-ink-2">{option.description}</span>
                      </button>
                    )
                  })}
                </div>
                {classification === 'GENERAL' && <p className="mt-4 text-sm text-ink-2">Every student is eligible, so there is nothing else to choose.</p>}
                {classification !== 'GENERAL' && universityDataLoading && <p className="mt-4 text-sm text-ink-2">Loading university faculties and majors...</p>}
                {classification !== 'GENERAL' && universityDataError && <p role="alert" className="mt-4 rounded-xl bg-rose/10 p-4 text-sm text-rose">{universityDataError}</p>}

                {classification === 'FACULTY_BASED' && !universityDataLoading && !universityDataError && (
                  <div className="relative mt-4 max-w-sm">
                    <p id="faculty-select-label" className="mb-2 text-sm font-semibold">Which faculty is it for?</p>
                    <button type="button" aria-labelledby="faculty-select-label faculty-selected-value" aria-expanded={facultyListOpen} aria-controls="faculty-options" onClick={() => setFacultyListOpen((open) => !open)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-left text-sm outline-none focus:border-plum focus:ring-2 focus:ring-plum/20">
                      <span id="faculty-selected-value" className={selectedFaculty ? 'text-ink' : 'text-ink-2'}>{selectedFaculty?.name ?? 'Choose a faculty...'}</span>
                      <ChevronDown size={18} aria-hidden="true" className={`shrink-0 transition ${facultyListOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {facultyListOpen && (
                      <div id="faculty-options" role="listbox" aria-labelledby="faculty-select-label" className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-ink/15 bg-paper shadow-xl">
                        <div className="max-h-48 overflow-y-auto overscroll-contain p-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#8b7c96 transparent' }}>
                          {faculties.map((faculty) => (
                            <button key={faculty.id} type="button" role="option" aria-selected={facultyId === faculty.id} onClick={() => { setFacultyId(faculty.id); setFacultyListOpen(false) }}
                              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-ink/5 ${facultyId === faculty.id ? 'bg-ink/10 font-semibold' : ''}`}>
                              {faculty.name}{facultyId === faculty.id && <Check size={16} aria-hidden="true" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedFaculty && <p className="mt-3 text-xs text-ink-2">All majors in {selectedFaculty.name} will be eligible.</p>}
                  </div>
                )}

                {classification === 'MAJOR_BASED' && !universityDataLoading && !universityDataError && (
                  <div className="mt-4 rounded-2xl bg-paper p-4">
                    <p className="text-sm font-semibold">Which majors can join?</p>
                    <p className="mt-1 text-xs text-ink-2">Choose majors from any faculty.</p>
                    <button type="button" onClick={openMajorPicker} className="mt-4 inline-flex items-center gap-2 rounded-full border border-ink/25 px-4 py-2 text-sm font-semibold hover:border-ink hover:bg-ink/5">
                      {selectedMajorIds.length ? 'Edit selected majors' : 'Select majors'}
                      <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-paper">{selectedMajorIds.length}</span>
                    </button>
                    {selectedMajors.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2" aria-label="Selected majors">
                        {selectedMajors.map((major) => (
                          <span key={major.id} className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-card px-3 py-1.5 text-xs font-semibold">
                            {major.name}
                            <button type="button" aria-label={`Remove ${major.name}`} onClick={() => setSelectedMajorIds((ids) => ids.filter((id) => id !== major.id))} className="rounded-full hover:text-rose"><X size={13} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {formError && <p role="alert" className="rounded-xl bg-rose/10 p-4 text-sm text-rose">{formError}</p>}
              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={() => setShowAddClub(false)} className="rounded-full border border-ink/20 px-6 py-3 text-sm font-semibold hover:bg-ink/5">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper hover:bg-plum-2 disabled:cursor-wait disabled:opacity-50">{saving ? 'Saving...' : editingClubId ? 'Save changes' : 'Create club'}</button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}

      {showAddClub && majorPickerOpen && createPortal(
        <div className="fixed inset-y-0 right-0 left-0 z-[60] flex items-center justify-center overflow-hidden bg-ink/70 p-3 sm:p-5 lg:left-[17rem]">
          <div role="dialog" aria-modal="true" aria-labelledby="choose-majors-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-paper shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]">
            <div className="shrink-0 border-b border-ink/10 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 id="choose-majors-title" className="font-display text-3xl">Select eligible majors</h3>
                  <p className="mt-1 text-sm text-ink-2">Select multiple majors across faculties.</p>
                </div>
                <button type="button" aria-label="Cancel major selection" onClick={() => setMajorPickerOpen(false)} className="rounded-full p-2 hover:bg-ink/5"><X size={20} /></button>
              </div>
              <input type="search" value={majorSearch} onChange={(event) => setMajorSearch(event.target.value)} placeholder="Search majors or faculties" aria-label="Search majors or faculties" className="mt-4 w-full rounded-xl border border-line bg-card px-4 py-3 text-sm outline-none focus:border-plum" />
              <p className="mt-3 text-xs font-semibold text-rose">{draftMajorIds.length} major{draftMajorIds.length === 1 ? '' : 's'} selected</p>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6" style={{ scrollbarWidth: 'thin', scrollbarColor: '#8b7c96 transparent' }}>
              {faculties.map((faculty) => {
                const query = majorSearch.trim().toLowerCase()
                const facultyMajors = majors.filter((major) => major.facultyId === faculty.id && (!query || faculty.name.toLowerCase().includes(query) || major.name.toLowerCase().includes(query)))
                if (!facultyMajors.length) return null
                return (
                  <div key={faculty.id}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-2">{faculty.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {facultyMajors.map((major) => {
                        const selected = draftMajorIds.includes(major.id)
                        return (
                          <button key={major.id} type="button" aria-pressed={selected}
                            onClick={() => setDraftMajorIds((ids) => selected ? ids.filter((id) => id !== major.id) : [...ids, major.id])}
                            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${selected ? 'border-ink bg-ink text-paper' : 'border-ink/20 bg-card text-ink hover:border-ink'}`}>
                            {major.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {majors.every((major) => {
                const facultyName = faculties.find((faculty) => faculty.id === major.facultyId)?.name ?? ''
                const query = majorSearch.trim().toLowerCase()
                return !!query && !major.name.toLowerCase().includes(query) && !facultyName.toLowerCase().includes(query)
              }) && <p className="text-sm text-ink-2">No matching majors found.</p>}
            </div>
            <div className="flex shrink-0 justify-end gap-3 border-t border-ink/10 bg-paper p-5 sm:p-6">
              <button type="button" onClick={() => setMajorPickerOpen(false)} className="rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold hover:bg-ink/5">Cancel</button>
              <button type="button" onClick={() => { setSelectedMajorIds(draftMajorIds); setMajorPickerOpen(false) }} className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-paper hover:bg-plum-2">Apply ({draftMajorIds.length})</button>
            </div>
          </div>
        </div>
      , document.body)}
    </section>
  )
}