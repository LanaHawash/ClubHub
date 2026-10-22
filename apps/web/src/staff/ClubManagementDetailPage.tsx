import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

type Club = {
  id: string
  name: string
  description: string
  contactEmail: string
  classification: 'GENERAL' | 'FACULTY_BASED' | 'MAJOR_BASED'
  status: 'ACTIVE' | 'ARCHIVED'
  logoUrl: string | null
  foundedYear: number | null
  meetingInfo: string | null
  supervisorId: string | null
  supervisor: {
    id: string
    fullName: string
  } | null
  faculty: {
    id: string
    name: string
  } | null
  eligibleMajors: {
    major: {
      id: string
      name: string
    }
  }[]
}

type Supervisor = {
  id: string
  fullName: string
  account: {
    id: string
    email: string
    status: 'ACTIVE' | 'DISABLED'
  }
}

type ClubManagementDetailPageProps = {
  clubId: string
  accessToken: string
  onBack: () => void
}

export default function ClubManagementDetailPage({
  clubId,
  accessToken,
  onBack,
}: ClubManagementDetailPageProps) {
  const [club, setClub] = useState<Club | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
const [supervisorsLoading, setSupervisorsLoading] = useState(true)
const [supervisorsError, setSupervisorsError] = useState('')
const [savingSupervisor, setSavingSupervisor] = useState(false)
const [isEditing, setIsEditing] = useState(false)
const [savingDetails, setSavingDetails] = useState(false)
const [editError, setEditError] = useState('')

const [editName, setEditName] = useState('')
const [editDescription, setEditDescription] = useState('')
const [editContactEmail, setEditContactEmail] = useState('')
const [editFoundedYear, setEditFoundedYear] = useState('')
const [editMeetingInfo, setEditMeetingInfo] = useState('')
const [updatingStatus, setUpdatingStatus] = useState(false)
  const [activeTab, setActiveTab] = useState<
  'overview' | 'members' | 'events' | 'finance'
   >('overview')

  useEffect(() => {
    const controller = new AbortController()

    async function loadClub() {
      setLoading(true)
      setError('')
      setClub(null)

      try {
        const response = await fetch(
          `/api/clubs/admin/${clubId}`,
          {
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        )

        if (!response.ok) {
          throw new Error(
            `Unable to load club (${response.status}).`,
          )
        }

        const data: Club = await response.json()

        if (!controller.signal.aborted) {
          setClub(data)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load club.',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadClub()

    return () => controller.abort()
  }, [clubId, accessToken])

  // Sprint 3.4: Load available supervisors.
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
          `Unable to load supervisors (${response.status}).`,
        )
      }

      const data: Supervisor[] = await response.json()

      if (!controller.signal.aborted) {
        setSupervisors(
          data.filter(
            (supervisor) =>
              supervisor.account.status === 'ACTIVE',
          ),
        )
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setSupervisorsError(
          err instanceof Error
            ? err.message
            : 'Unable to load supervisors.',
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


async function assignSupervisor(supervisorId: string) {
  if (!club || !supervisorId || savingSupervisor) return

  setSavingSupervisor(true)
  setError('')

  try {
    const response = await fetch(
      `/api/clubs/${club.id}/supervisor`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ supervisorId }),
      },
    )

    if (!response.ok) {
      const body: { message?: string | string[] } =
        await response.json().catch(() => ({}))

      const message = Array.isArray(body.message)
        ? body.message.join(' ')
        : body.message

      throw new Error(
        message ||
          `Unable to assign supervisor (${response.status}).`,
      )
    }

    // Refresh club details from PostgreSQL.
    const updatedResponse = await fetch(
      `/api/clubs/admin/${club.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    if (!updatedResponse.ok) {
      throw new Error(
        'Supervisor saved, but the club could not be refreshed.',
      )
    }

    const updatedClub: Club = await updatedResponse.json()
    setClub(updatedClub)
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Unable to assign supervisor.',
    )
  } finally {
    setSavingSupervisor(false)
  }
}


async function toggleClubStatus() {
  if (!club || updatingStatus) return

  const archiving = club.status === 'ACTIVE'

  const confirmed = window.confirm(
    archiving
      ? `Are you sure you want to archive "${club.name}"?`
      : `Are you sure you want to activate "${club.name}"?`,
  )

  if (!confirmed) return

  setUpdatingStatus(true)
  setError('')

  try {
    const endpoint = archiving ? 'archive' : 'activate'

    const response = await fetch(
      `/api/clubs/${club.id}/${endpoint}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    if (!response.ok) {
      throw new Error(
        `Unable to ${endpoint} club (${response.status}).`,
      )
    }

    const updatedResponse = await fetch(
      `/api/clubs/admin/${club.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    if (!updatedResponse.ok) {
      throw new Error(
        'Club status updated, but details could not be refreshed.',
      )
    }

    const updatedClub: Club = await updatedResponse.json()

    setClub(updatedClub)
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Unable to update club status.',
    )
  } finally {
    setUpdatingStatus(false)
  }
}

function startEditing() {
  if (!club) return

  setEditName(club.name)
  setEditDescription(club.description)
  setEditContactEmail(club.contactEmail)
  setEditFoundedYear(club.foundedYear?.toString() ?? '')
  setEditMeetingInfo(club.meetingInfo ?? '')

  setEditError('')
  setIsEditing(true)
}

async function saveClubDetails() {
  if (!club || savingDetails) return

  setEditError('')

  const name = editName.trim()
  const description = editDescription.trim()
  const contactEmail = editContactEmail.trim().toLowerCase()
  const foundedYear = editFoundedYear.trim()
    ? Number(editFoundedYear)
    : null

  if (!name || !description || !contactEmail) {
    setEditError('Name, description, and contact email are required.')
    return
  }

  if (
    foundedYear !== null &&
    (!Number.isInteger(foundedYear) ||
      foundedYear < 1800 ||
      foundedYear > 2100)
  ) {
    setEditError('Founded year must be between 1800 and 2100.')
    return
  }

  setSavingDetails(true)

  try {
    const response = await fetch(`/api/clubs/${club.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name,
        description,
        contactEmail,
        foundedYear,
        meetingInfo: editMeetingInfo.trim() || null,
      }),
    })

    if (!response.ok) {
      const body: { message?: string | string[] } =
        await response.json().catch(() => ({}))

      const message = Array.isArray(body.message)
        ? body.message.join(' ')
        : body.message

      throw new Error(
        message || `Unable to update club (${response.status}).`,
      )
    }

    // Reload the saved data from PostgreSQL.
    const updatedResponse = await fetch(
      `/api/clubs/admin/${club.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      },
    )

    if (!updatedResponse.ok) {
      throw new Error(
        'Club updated, but its details could not be refreshed.',
      )
    }

    const updatedClub: Club = await updatedResponse.json()

    setClub(updatedClub)
    setIsEditing(false)
  } catch (err) {
    setEditError(
      err instanceof Error
        ? err.message
        : 'Unable to save club details.',
    )
  } finally {
    setSavingDetails(false)
  }
}

  return (
    <section className="mx-auto max-w-5xl anim-rise">
      <button
        type="button"
        onClick={onBack}
        className="mb-8 rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold hover:bg-ink/5"
      >
        <ArrowLeft size={16} className="mr-2 inline" />
        All clubs
      </button>

      {loading && (
        <p className="text-ink-2">Loading club details...</p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-rose/20 bg-rose/10 p-5 text-rose"
        >
          {error}
        </p>
      )}

      {!loading && !error && club && (
        <>
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">
            Club Management
          </p>

          <h1 className="font-display text-5xl leading-tight sm:text-6xl">
            {club.name}
          </h1>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
  <div className="flex flex-wrap gap-3">
    <span className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper">
      {club.status}
    </span>

    <span className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold">
      {club.classification.replaceAll('_', ' ')}
    </span>
  </div>

  <button
    type="button"
    onClick={() => void toggleClubStatus()}
    disabled={updatingStatus}
    className="rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold transition hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {updatingStatus
      ? 'Updating...'
      : club.status === 'ACTIVE'
        ? 'Archive Club'
        : 'Activate Club'}
  </button>
</div>

            
            {/* Club management navigation — Figma layout */}
<nav
  aria-label="Club management sections"
  className="mt-10 flex gap-2 overflow-x-auto border-b border-ink/10 pb-3"
>
  {([
    { id: 'overview', label: 'Overview' },
    { id: 'members', label: 'Members' },
    { id: 'events', label: 'Events' },
    { id: 'finance', label: 'Finance' },
  ] as const).map((tab) => (
            <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                activeTab === tab.id
                ? 'bg-ink text-paper'
                : 'text-ink-2 hover:bg-ink/5 hover:text-ink'
            }`}
            >
            {tab.label}
            </button>
        ))}
        </nav>

       {activeTab === 'overview' && (
  <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">

    {/* LEFT COLUMN */}
    <div className="space-y-6">

      {/* CLUB DETAILS */}
      <section className="rounded-3xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-3xl">
          Club details
        </h2>

        <p className="mt-4 text-sm leading-relaxed text-ink-2">
          {club.description}
        </p>

        <div className="mt-6 space-y-3 text-sm">
          <p>
            <span className="font-semibold">Contact email:</span>{' '}
            {club.contactEmail}
          </p>

          <p>
            <span className="font-semibold">Founded:</span>{' '}
            {club.foundedYear ?? 'Not specified'}
          </p>

          <p>
            <span className="font-semibold">Meeting information:</span>{' '}
            {club.meetingInfo || 'Not specified'}
          </p>
        </div>

   {!isEditing ? (
  <button
    type="button"
    onClick={startEditing}
    className="mt-6 rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold transition hover:bg-ink/5"
  >
    Edit details
  </button>
) : (
  <div className="mt-6 space-y-4 rounded-2xl border border-ink/10 bg-paper p-5">
    <h3 className="text-lg font-semibold">Edit club details</h3>

    <label className="block">
      <span className="mb-2 block text-sm font-semibold">
        Club name
      </span>
      <input
        type="text"
        value={editName}
        onChange={(event) => setEditName(event.target.value)}
        className="w-full rounded-xl border border-ink/20 bg-card px-4 py-3"
      />
    </label>

    <label className="block">
      <span className="mb-2 block text-sm font-semibold">
        Description
      </span>
      <textarea
        rows={4}
        value={editDescription}
        onChange={(event) => setEditDescription(event.target.value)}
        className="w-full rounded-xl border border-ink/20 bg-card px-4 py-3"
      />
    </label>

    <label className="block">
      <span className="mb-2 block text-sm font-semibold">
        Contact email
      </span>
      <input
        type="email"
        value={editContactEmail}
        onChange={(event) => setEditContactEmail(event.target.value)}
        className="w-full rounded-xl border border-ink/20 bg-card px-4 py-3"
      />
    </label>

    <label className="block">
      <span className="mb-2 block text-sm font-semibold">
        Founded year
      </span>
      <input
        type="number"
        min={1800}
        max={2100}
        value={editFoundedYear}
        onChange={(event) => setEditFoundedYear(event.target.value)}
        className="w-full rounded-xl border border-ink/20 bg-card px-4 py-3"
      />
    </label>

    <label className="block">
      <span className="mb-2 block text-sm font-semibold">
        Meeting information
      </span>
      <textarea
        rows={3}
        value={editMeetingInfo}
        onChange={(event) => setEditMeetingInfo(event.target.value)}
        className="w-full rounded-xl border border-ink/20 bg-card px-4 py-3"
      />
    </label>

    {editError && (
      <p role="alert" className="text-sm text-rose">
        {editError}
      </p>
    )}

    <div className="flex flex-wrap gap-3">
    <button
  type="button"
  onClick={() => void saveClubDetails()}
  disabled={savingDetails}
  className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper disabled:opacity-50"
>
  {savingDetails ? 'Saving...' : 'Save changes'}
</button>

      <button
        type="button"
        onClick={() => {
          setIsEditing(false)
          setEditError('')
        }}
        disabled={savingDetails}
        className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold"
      >
        Cancel
      </button>
    </div>
  </div>
)}
      </section>

      {/* CATEGORY AND ELIGIBILITY */}
      <section className="rounded-3xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-3xl">
          Category & eligibility
        </h2>

        <p className="mt-4 text-sm text-ink-2">
          Classification:{' '}
          <span className="font-semibold text-ink">
            {club.classification.replaceAll('_', ' ')}
          </span>
        </p>

        {club.faculty && (
          <p className="mt-3 text-sm text-ink-2">
            Faculty: {club.faculty.name}
          </p>
        )}

        {club.eligibleMajors.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold">Eligible majors</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {club.eligibleMajors.map((item) => (
                <span
                  key={item.major.id}
                  className="rounded-full bg-paper-2 px-3 py-1 text-xs font-semibold"
                >
                  {item.major.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* BOARD AND SHARED ACCOUNT */}
      <section className="rounded-3xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-3xl">
          Board & shared account
        </h2>

        <p className="mt-4 text-sm text-ink-2">
          Club board appointments and shared administrator account
          management will be connected in their respective sprints.
        </p>
      </section>

    </div>

    {/* RIGHT COLUMN */}
    <div className="space-y-6">

    
      {/* SUPERVISOR — Sprint 3.4 */}
<section className="rounded-3xl border border-ink/10 bg-card p-6">
  <div className="flex items-center justify-between gap-3">
    <h2 className="font-display text-3xl">
      Supervisor
    </h2>

    <span className="rounded-full bg-paper-2 px-3 py-1 text-xs font-semibold">
      {club.supervisor ? 'Assigned' : 'Unassigned'}
    </span>
  </div>

  <div className="mt-5 rounded-2xl bg-paper p-4">
    <p className="text-sm font-semibold text-ink">
      {club.supervisor?.fullName ?? 'No supervisor assigned'}
    </p>

    <p className="mt-1 text-xs text-ink-2">
      Assigned club supervisor
    </p>
  </div>

  <label
    htmlFor="club-supervisor"
    className="mt-6 block text-sm font-semibold"
  >
    {club.supervisor ? 'Change supervisor' : 'Assign supervisor'}
  </label>

  <select
    id="club-supervisor"
    value={
      supervisors.some((supervisor) => supervisor.id === club.supervisorId)
        ? club.supervisorId ?? ''
        : ''
    }
    disabled={
      supervisorsLoading ||
      Boolean(supervisorsError) ||
      savingSupervisor
    }
    onChange={(event) => {
      void assignSupervisor(event.target.value)
    }}
    className="mt-2 w-full rounded-xl border border-ink/20 bg-paper px-4 py-3 text-sm outline-none focus:border-plum disabled:opacity-50"
  >
    <option value="" disabled>
      {supervisorsLoading
        ? 'Loading supervisors...'
        : 'Choose a supervisor'}
    </option>

    {supervisors.map((supervisor) => (
      <option key={supervisor.id} value={supervisor.id}>
        {supervisor.fullName}
      </option>
    ))}
  </select>

  {savingSupervisor && (
    <p className="mt-3 text-xs text-ink-2">
      Saving supervisor assignment...
    </p>
  )}

  {supervisorsError && (
    <p role="alert" className="mt-3 text-sm text-rose">
      {supervisorsError}
    </p>
  )}

  <p className="mt-4 text-xs leading-relaxed text-ink-2">
    Only active supervisor accounts can be assigned.
    Changing the supervisor preserves the club's existing information.
  </p>
</section>

      {/* MEMBERSHIP FEES */}
      <section className="rounded-3xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-3xl">
          Membership fees
        </h2>

        <p className="mt-4 text-sm text-ink-2">
          Membership fees will become available in Sprint 5.
        </p>
      </section>

    </div>
  </div>
)}

        {activeTab !== 'overview' && (
  <div className="mt-10 rounded-3xl border border-ink/10 bg-card p-8">
    <h2 className="font-display text-3xl capitalize">
      {activeTab}
    </h2>

    <p className="mt-4 text-ink-2">
      This section will be connected to its corresponding
      ClubHub API in a later sprint.
    </p>
  </div>
)}
        </>
      )}
    </section>
  )
}