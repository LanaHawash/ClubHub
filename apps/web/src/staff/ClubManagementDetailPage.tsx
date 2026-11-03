import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import ClubAdministratorsPanel from './ClubAdministratorsPanel'
import BoardAppointmentsPanel from './BoardAppointmentsPanel'
import ClubImageUpload from './ClubImageUpload'
import ClubLabelsPicker, { type ClubLabelsSelection } from './ClubLabelsPicker'
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
  labels?: { labelId: string; label: { id: string; name: string } }[]
  eligibleMajors: {
    major: {
      id: string
      name: string
    }
  }[]
  membershipSettings?: {
  registrationMode: 'ALWAYS_OPEN' | 'WINDOWED'
  pendingFirstTimeFee: string
  pendingRenewalFee: string
  currency: string
  configVersion: number
} | null

membershipFeeVersions?: {
  id: string
  firstTimeFee: string
  renewalFee: string
  currency: string
  effectiveAt: string
}[]

registrationWindows?: {
  id: string
  opensAt: string
  closesAt: string
  closedAt: string | null
  effectiveFeeVersionId: string | null
  canceledAt: string | null
}[]
}

type Faculty = { id: string; name: string }
type Major = { id: string; name: string; facultyId: string }
type Classification = Club['classification']

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
const [labelSelection, setLabelSelection] = useState<ClubLabelsSelection>({ labelIds: [], newLabels: [] })
const [savingLabels, setSavingLabels] = useState(false)
const [labelsError, setLabelsError] = useState('')
const [labelsStatus, setLabelsStatus] = useState('')
const [closingWindowId, setClosingWindowId] =
  useState<string | null>(null)
const [faculties, setFaculties] = useState<Faculty[]>([])
const [majors, setMajors] = useState<Major[]>([])
const [eligibilityLoading, setEligibilityLoading] = useState(true)
const [eligibilityError, setEligibilityError] = useState('')
const [eligibilitySaving, setEligibilitySaving] = useState(false)
const [eligibilitySuccess, setEligibilitySuccess] = useState('')
const [eligibilityClassification, setEligibilityClassification] = useState<Classification>('GENERAL')
const [eligibilityFacultyId, setEligibilityFacultyId] = useState('')
const [eligibilityMajorIds, setEligibilityMajorIds] = useState<string[]>([])
const [firstTimeFee, setFirstTimeFee] = useState('')
const [renewalFee, setRenewalFee] = useState('')
const [savingFees, setSavingFees] = useState(false)
const [feesError, setFeesError] = useState('')
const [feesSuccess, setFeesSuccess] = useState('')
const [registrationMode, setRegistrationMode] =
  useState<'ALWAYS_OPEN' | 'WINDOWED'>('ALWAYS_OPEN')

const [windowStart, setWindowStart] = useState('')
const [windowEnd, setWindowEnd] = useState('')

const [editingWindowId, setEditingWindowId] =
  useState<string | null>(null)

const [savingWindow, setSavingWindow] = useState(false)
const [savingMode, setSavingMode] = useState(false)

const [windowError, setWindowError] = useState('')
const [windowSuccess, setWindowSuccess] = useState('')
const [editName, setEditName] = useState('')
const [editDescription, setEditDescription] = useState('')
const [editContactEmail, setEditContactEmail] = useState('')
const [editFoundedYear, setEditFoundedYear] = useState('')
const [editMeetingInfo, setEditMeetingInfo] = useState('')
const [editLogoUrl, setEditLogoUrl] = useState('')
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
          setEligibilityClassification(data.classification)
          setEligibilityFacultyId(data.faculty?.id ?? '')
          setEligibilityMajorIds(data.eligibleMajors.map((item) => item.major.id))
          setLabelSelection({ labelIds: (data.labels ?? []).map((item) => item.labelId ?? item.label.id), newLabels: [] })
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
useEffect(() => {
  setRegistrationMode(
    club?.membershipSettings?.registrationMode ?? 'ALWAYS_OPEN',
  )
}, [club?.id, club?.membershipSettings?.configVersion])
async function refreshMembershipClub() {
  if (!club) return

  const response = await fetch(`/api/clubs/admin/${club.id}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error('Unable to reload membership configuration.')
  }

  const updated: Club = await response.json()

  setClub(updated)
}
async function closeRegistrationWindow(windowId: string) {
  if (!club || closingWindowId) return

  const confirmed = window.confirm(
    'Close this registration window now?\n\n' +
    'Students will no longer be allowed to register during ' +
    'this window once registration enforcement is connected.\n\n' +
    'This action cannot be undone.',
  )

  if (!confirmed) return

  setClosingWindowId(windowId)
  setWindowError('')
  setWindowSuccess('')

  try {
    const response = await fetch(
      `/api/clubs/${club.id}/membership/windows/${windowId}/close`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    if (!response.ok) {
      const body: { message?: string | string[] } =
        await response.json().catch(() => ({}))

      throw new Error(
        Array.isArray(body.message)
          ? body.message.join(' ')
          : body.message ||
            `Unable to close registration (${response.status}).`,
      )
    }

    await refreshMembershipClub()

    // Clear any pending edits to the window that was just closed.
    if (editingWindowId === windowId) {
      setEditingWindowId(null)
      setWindowStart('')
      setWindowEnd('')
    }

    setWindowSuccess(
      'Registration window closed successfully.',
    )
  } catch (error) {
    setWindowError(
      error instanceof Error
        ? error.message
        : 'Unable to close registration.',
    )
  } finally {
    setClosingWindowId(null)
  }
}
async function saveWindowConfiguration() {
  if (!club?.membershipSettings || savingWindow || savingMode) return
  setWindowError('')
  setWindowSuccess('')

  const settings = club.membershipSettings
  const switchingMode = registrationMode !== settings.registrationMode
  const needsWindow = registrationMode === 'WINDOWED' &&
    (switchingMode || Boolean(editingWindowId) ||
      (!editingWindowId && Boolean(windowStart || windowEnd)))

  if (registrationMode === 'WINDOWED' && needsWindow) {
    if (!windowStart || !windowEnd) {
      setWindowError('Select both opening and closing dates.')
      return
    }
    const opensAt = new Date(`${windowStart}T00:00:00`)
    // Figma date selection is inclusive; backend closes at the next midnight.
    const closesAt = new Date(new Date(`${windowEnd}T00:00:00`).getTime() + 86_400_000)
    if (!Number.isFinite(opensAt.getTime()) || !Number.isFinite(closesAt.getTime()) ||
        opensAt <= new Date() || closesAt <= opensAt) {
      setWindowError('Choose a valid future registration period.')
      return
    }
  }

  setSavingMode(true)
  setSavingWindow(true)
  try {
    const readError = async (response: Response) => {
      const body: { message?: string | string[] } = await response.json().catch(() => ({}))
      return Array.isArray(body.message) ? body.message.join(' ') :
        body.message || `Unable to save registration (${response.status}).`
    }
    if (switchingMode) {
      const response = await fetch(`/api/clubs/${club.id}/membership/mode`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ registrationMode, configVersion: settings.configVersion }),
      })
      if (!response.ok) throw new Error(await readError(response))
    }
    if (needsWindow) {
      const opensAt = new Date(`${windowStart}T00:00:00`)
      const closesAt = new Date(new Date(`${windowEnd}T00:00:00`).getTime() + 86_400_000)
      const response = await fetch(
        editingWindowId
          ? `/api/clubs/${club.id}/membership/windows/${editingWindowId}`
          : `/api/clubs/${club.id}/membership/windows`,
        {
          method: editingWindowId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() }),
        },
      )
      if (!response.ok) throw new Error(await readError(response))
    }
    await refreshMembershipClub()
    setEditingWindowId(null)
    setWindowStart('')
    setWindowEnd('')
    setWindowSuccess('Registration settings saved.')
  } catch (error) {
    // Refresh even after a partial save (mode may have succeeded before the window failed).
    try { await refreshMembershipClub() } catch { /* Keep the original error visible. */ }
    setWindowError(error instanceof Error ? error.message : 'Unable to save registration settings.')
  } finally {
    setSavingMode(false)
    setSavingWindow(false)
  }
}
  useEffect(() => {
    const controller = new AbortController()
    async function loadEligibilityCatalog() {
      setEligibilityLoading(true)
      try {
        const [fr, mr] = await Promise.all([
          fetch('/api/university/faculties', { signal: controller.signal }),
          fetch('/api/university/majors', { signal: controller.signal }),
        ])
        if (!fr.ok || !mr.ok) throw new Error('Unable to load university faculties and majors.')
        const [f, m] = await Promise.all([fr.json() as Promise<Faculty[]>, mr.json() as Promise<Major[]>])
        if (!controller.signal.aborted) { setFaculties(f); setMajors(m); setEligibilityError('') }
      } catch (e) {
        if (!controller.signal.aborted) setEligibilityError(e instanceof Error ? e.message : 'Unable to load eligibility data.')
      } finally {
        if (!controller.signal.aborted) setEligibilityLoading(false)
      }
    }
    void loadEligibilityCatalog()
    return () => controller.abort()
  }, [])
  useEffect(() => {
  const settings = club?.membershipSettings

  setFirstTimeFee(settings?.pendingFirstTimeFee ?? '')
  setRenewalFee(settings?.pendingRenewalFee ?? '')
}, [club?.id, club?.membershipSettings?.configVersion])

  async function saveEligibility() {
    if (!club || eligibilitySaving) return
    setEligibilityError('')
    setEligibilitySuccess('')
    if (eligibilityClassification === 'FACULTY_BASED' && !eligibilityFacultyId) {
      setEligibilityError('Choose a faculty.'); return
    }
    if (eligibilityClassification === 'MAJOR_BASED' && eligibilityMajorIds.length === 0) {
      setEligibilityError('Select at least one major.'); return
    }
    setEligibilitySaving(true)
    try {
      const response = await fetch(`/api/clubs/${club.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          classification: eligibilityClassification,
          facultyId: eligibilityClassification === 'FACULTY_BASED' ? eligibilityFacultyId : null,
          eligibleMajorIds: eligibilityClassification === 'MAJOR_BASED' ? eligibilityMajorIds : [],
        }),
      })
      if (!response.ok) {
        const body: { message?: string | string[] } = await response.json().catch(() => ({}))
        throw new Error(Array.isArray(body.message) ? body.message.join(' ') : body.message || `Unable to save eligibility (${response.status}).`)
      }
      const refresh = await fetch(`/api/clubs/admin/${club.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
      })
      if (!refresh.ok) throw new Error('Eligibility saved, but refreshing the club failed.')
      const saved: Club = await refresh.json()
      setClub(saved)
      setEligibilityClassification(saved.classification)
      setEligibilityFacultyId(saved.faculty?.id ?? '')
      setEligibilityMajorIds(saved.eligibleMajors.map((item) => item.major.id))
      setEligibilitySuccess('Eligibility saved.')
    } catch (e) {
      setEligibilityError(e instanceof Error ? e.message : 'Unable to save eligibility.')
    } finally { setEligibilitySaving(false) }
  }

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
async function saveMembershipFees() {
  if (!club || savingFees) return

  setFeesError('')
  setFeesSuccess('')

  const amountPattern = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/

  if (
    !amountPattern.test(firstTimeFee) ||
    !amountPattern.test(renewalFee) ||
    Number(firstTimeFee) <= 0 ||
    Number(renewalFee) <= 0
  ) {
    setFeesError(
      'Enter valid positive amounts with at most two decimal places.',
    )
    return
  }

  setSavingFees(true)

  try {
    const response = await fetch(
      club.membershipSettings
        ? `/api/clubs/${club.id}/membership/fees`
        : `/api/clubs/${club.id}/membership/initialize`,
      {
        method: club.membershipSettings ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          firstTimeFee,
          renewalFee,
          ...(club.membershipSettings ? { configVersion: club.membershipSettings.configVersion } : {}),
        }),
      },
    )

    if (!response.ok) {
      const body: { message?: string | string[] } =
        await response.json().catch(() => ({}))

      const message = Array.isArray(body.message)
        ? body.message.join(' ')
        : body.message

      throw new Error(message || `Unable to save fees (${response.status}).`)
    }

    const refreshed = await fetch(`/api/clubs/admin/${club.id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    })

    if (!refreshed.ok) {
      throw new Error(
        'Fees saved, but the club could not be reloaded. Refresh the page.',
      )
    }

    const updated: Club = await refreshed.json()

    setClub(updated)
    setFirstTimeFee(updated.membershipSettings?.pendingFirstTimeFee ?? '')
    setRenewalFee(updated.membershipSettings?.pendingRenewalFee ?? '')

    setFeesSuccess(
      !club.membershipSettings
        ? 'Membership configured. Registration window controls are now available.'
        : updated.membershipSettings?.registrationMode === 'ALWAYS_OPEN'
        ? 'Membership fees updated and effective immediately.'
        : 'Future membership fees saved.',
    )
  } catch (error) {
    setFeesError(
      error instanceof Error
        ? error.message
        : 'Unable to update membership fees.',
    )
  } finally {
    setSavingFees(false)
  }
}

async function saveLabels(next: ClubLabelsSelection) {
  if (!club || savingLabels) return
  setSavingLabels(true)
  setLabelsError('')
  setLabelsStatus('')
  try {
    const response = await fetch(`/api/clubs/${club.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(next),
    })
    if (!response.ok) {
      const body: { message?: string | string[] } = await response.json().catch(() => ({}))
      throw new Error(Array.isArray(body.message) ? body.message.join(' ') : body.message ?? `Unable to save labels (${response.status}).`)
    }
    const updated = await fetch(`/api/clubs/admin/${club.id}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
    if (!updated.ok) throw new Error('Saved labels, but unable to reload club.')
    const data: Club = await updated.json()
    setClub(data)
    setLabelSelection({ labelIds: (data.labels ?? []).map((item) => item.labelId ?? item.label.id), newLabels: [] })
    setLabelsStatus('Labels saved.')
  } catch (err) {
    setLabelsError(err instanceof Error ? err.message : 'Unable to save labels.')
  } finally { setSavingLabels(false) }
}

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
  setEditLogoUrl(club.logoUrl ?? '')
  

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
        logoUrl: editLogoUrl.trim() || null,
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
  <div className="mt-8 grid gap-6 lg:grid-cols-2">
      {/* CLUB DETAILS */}
      <section className="rounded-3xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-3xl">
          Details
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

    {/* <label className="block">
      <span className="mb-2 block text-sm font-semibold">Club image / logo URL</span>
      <input
        type="url"
        value={editLogoUrl}
        onChange={(event) => setEditLogoUrl(event.target.value)}
        placeholder="https://example.com/club-image.jpg"
        className="w-full rounded-xl border border-ink/20 bg-card px-4 py-3"
      />
      <span className="mt-1 block text-xs text-ink-2">Paste an image URL or clear it to remove the image. The photo appears beneath the cover colors on the student site.</span>
    </label> */}
    <ClubImageUpload
  value={editLogoUrl}
  onChange={setEditLogoUrl}
  accessToken={accessToken}
/>

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

      {/* Figma: membership fees editor — backend scheduled for a later sprint. */}
      <section className="rounded-3xl border border-ink/10 bg-card p-6">
  <h2 className="font-display text-3xl">Membership fees</h2>

  {!club.membershipSettings && (
    <p className="mt-4 text-sm text-ink-2">
      Enter this club's actual membership fees to enable registration settings.
      Registration will start in Any time mode; you can choose Set a window afterward.
    </p>
  )}
  <>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          First-time members (ILS)

          <input
            type="number"
            min="0.00"
            max="99999999.99"
            step="5"
            value={firstTimeFee}
            disabled={savingFees || club.status !== 'ACTIVE'}
            onChange={(event) => {
              setFirstTimeFee(event.target.value)
              setFeesSuccess('')
            }}
            className="mt-2 w-full rounded-xl border border-ink/20 bg-paper px-4 py-3"
          />
        </label>

        <label className="block text-sm font-semibold">
          Renewals (ILS)

          <input
            type="number"
            min="0.00"
            max="99999999.99"
            step="5"
            value={renewalFee}
            disabled={savingFees || club.status !== 'ACTIVE'}
            onChange={(event) => {
              setRenewalFee(event.target.value)
              setFeesSuccess('')
            }}
            className="mt-2 w-full rounded-xl border border-ink/20 bg-paper px-4 py-3"
          />
        </label>
      </div>

      <p className="mt-4 text-xs text-ink-2">
        {!club.membershipSettings
          ? 'Save the initial fees to configure membership for this existing club.'
          : club.membershipSettings.registrationMode === 'ALWAYS_OPEN'
          ? 'Changes to these fees take effect immediately. Previous prices remain in history.'
          : 'Changes are saved for future registration windows. Prices already locked to a window remain unchanged.'}
      </p>

      <div className="mt-5 rounded-xl border border-ink/10 bg-paper p-4">
        <p className="text-sm font-semibold">
          Latest effective fee version
        </p>

        {club.membershipFeeVersions?.[0] ? (
          <p className="mt-2 text-sm text-ink-2">
            First-time:{' '}
            {club.membershipFeeVersions[0].firstTimeFee}{' '}
            {club.membershipFeeVersions[0].currency}
            {' · '}
            Renewal:{' '}
            {club.membershipFeeVersions[0].renewalFee}{' '}
            {club.membershipFeeVersions[0].currency}
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-2">
            No effective fee version has been recorded yet.
          </p>
        )}
      </div>

      {club.status !== 'ACTIVE' && (
        <p className="mt-4 text-sm text-ink-2">
          Membership fees cannot be changed while this club is archived.
        </p>
      )}

      {feesError && (
        <p role="alert" className="mt-4 text-sm text-rose">
          {feesError}
        </p>
      )}

      {feesSuccess && (
        <p role="status" className="mt-4 text-sm text-ink-2">
          {feesSuccess}
        </p>
      )}

      <div className="mt-5 flex items-center justify-end border-t border-ink/10 pt-4">
        <button
          type="button"
          onClick={() => void saveMembershipFees()}
          disabled={
            savingFees ||
            club.status !== 'ACTIVE' ||
            (
              firstTimeFee === club.membershipSettings?.pendingFirstTimeFee &&
              renewalFee === club.membershipSettings?.pendingRenewalFee
            )
          }
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-40"
        >
          {savingFees ? 'Saving...' : club.membershipSettings ? 'Save fees' : 'Configure membership'}
        </button>
      </div>
    </>
</section>

      {/* Original Figma AudiencePicker: full-width and editable with Sprint 3 API. */}
      <section className="lg:col-span-2 rounded-3xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-3xl">Category and eligibility</h2>
        <div className="mt-5 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Club category">
          {([
            ['MAJOR_BASED', 'Major club', 'Only chosen majors'],
            ['FACULTY_BASED', 'Faculty club', 'One whole faculty'],
            ['GENERAL', 'University-wide club', 'Every student'],
          ] as const).map(([value, title, subtitle]) => (
            <button type="button" key={value} role="radio" aria-checked={eligibilityClassification === value}
              onClick={() => { setEligibilityClassification(value); setEligibilitySuccess('') }}
              className={`rounded-2xl border-2 p-3 text-left transition ${eligibilityClassification === value ? 'border-ink bg-paper' : 'border-ink/15 hover:border-ink/40'}`}>
              <span className="block font-semibold">{title}</span>
              <span className="text-xs text-ink-2">{subtitle}</span>
            </button>
          ))}
        </div>
        {eligibilityClassification === 'GENERAL' && <p className="mt-3 text-sm text-ink-2">Every student is eligible, so there is nothing else to choose.</p>}
        {eligibilityClassification === 'FACULTY_BASED' && (
          <label className="mt-4 block max-w-sm text-sm font-semibold">Which faculty is it for?
            <select className="mt-2 w-full rounded-xl border border-ink/20 bg-paper px-4 py-3 font-normal" value={eligibilityFacultyId} onChange={(e) => setEligibilityFacultyId(e.target.value)}>
              <option value="">Choose a faculty…</option>
              {faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        )}
        {eligibilityClassification === 'MAJOR_BASED' && (
          <div className="mt-4 space-y-3 rounded-2xl bg-paper p-4">
            <p className="text-sm font-semibold">Which majors can join?</p>
            <div
              role="group"
              aria-label="Available faculties and majors"
              tabIndex={0}
              className="max-h-80 space-y-3 overflow-y-auto overscroll-contain pr-2"
              style={{ scrollbarWidth: 'thin' }}
            >
              {faculties.map((faculty) => (
              <div key={faculty.id}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-2">{faculty.name}</p>
                <div className="flex flex-wrap gap-2">
                  {majors.filter((m) => m.facultyId === faculty.id).map((major) => {
                    const chosen = eligibilityMajorIds.includes(major.id)
                    return <button key={major.id} type="button" aria-pressed={chosen}
                      onClick={() => setEligibilityMajorIds((ids) => chosen ? ids.filter((id) => id !== major.id) : [...ids, major.id])}
                      className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${chosen ? 'border-ink bg-ink text-paper' : 'border-ink/20 hover:border-ink'}`}>{major.name}</button>
                  })}
                </div>
              </div>
              ))}
            </div>
          </div>
        )}
        {eligibilityLoading && <p className="mt-3 text-sm text-ink-2">Loading faculties and majors...</p>}
        {eligibilityError && <p role="alert" className="mt-3 text-sm text-rose">{eligibilityError}</p>}
        {eligibilitySuccess && <p role="status" className="mt-3 text-sm text-ink-2">{eligibilitySuccess}</p>}
        <button type="button" onClick={() => void saveEligibility()} disabled={eligibilitySaving || eligibilityLoading || Boolean(eligibilityError)} className="mt-5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-40">
          {eligibilitySaving ? 'Saving...' : 'Save eligibility'}
        </button>
      </section>

      {/* Figma WindowPanel visual structure; existing Sprint 5 membership APIs stay connected. */}
      <section className="lg:col-span-2 rounded-3xl border border-ink/10 bg-card p-6 sm:p-8">
        <h2 className="font-display text-3xl">Membership registration window</h2>
        <div className="mt-5">
          <div className="inline-flex rounded-full border border-ink/15 p-0.5 text-sm font-semibold" role="group" aria-label="Registration window mode">
            {([['Any time', 'ALWAYS_OPEN'], ['Set a window', 'WINDOWED']] as const).map(([label, mode]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={registrationMode === mode}
                disabled={club.status !== 'ACTIVE' || savingMode || !club.membershipSettings}
                onClick={() => {
                  setRegistrationMode(mode)
                  setWindowError('')
                  setWindowSuccess('')
                }}
                className={`rounded-full px-4 py-1.5 transition disabled:opacity-50 ${registrationMode === mode ? 'bg-ink text-paper' : 'text-ink-2'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {registrationMode === 'WINDOWED' ? (
            <div className="mt-3 grid max-w-md gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Opens
                <input type="date" value={windowStart}
                  onChange={(event) => setWindowStart(event.target.value)}
                  disabled={club.status !== 'ACTIVE' || savingWindow || !club.membershipSettings}
                  className="mt-2 block w-full rounded-xl border border-ink/20 bg-white px-4 py-3 font-normal" />
              </label>
              <label className="block text-sm font-semibold">
                Closes
                <input type="date" value={windowEnd} min={windowStart}
                  onChange={(event) => setWindowEnd(event.target.value)}
                  disabled={club.status !== 'ACTIVE' || savingWindow || !club.membershipSettings}
                  className="mt-2 block w-full rounded-xl border border-ink/20 bg-white px-4 py-3 font-normal" />
              </label>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-2">Students can join or renew whenever they like.</p>
          )}
        </div>
        {club.membershipSettings === null || club.membershipSettings === undefined ? (
          <p role="status" className="mt-4 text-sm text-ink-2">
            Membership settings are missing for this club. Saving is unavailable until they are configured.
          </p>
        ) : null}
        {windowError && <p role="alert" className="mt-4 text-sm text-rose">{windowError}</p>}
        {windowSuccess && <p role="status" className="mt-4 text-sm text-ink-2">{windowSuccess}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-4">
          <p className="max-w-md text-xs text-ink-2">
            Applies to joining and renewing. Each membership lasts one year from the day it is paid.
          </p>
          <button type="button" onClick={() => void saveWindowConfiguration()}
            disabled={club.status !== 'ACTIVE' || !club.membershipSettings || savingMode || savingWindow ||
              (registrationMode === club.membershipSettings.registrationMode && !editingWindowId &&
                (registrationMode === 'ALWAYS_OPEN' || (!windowStart && !windowEnd)))}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:cursor-not-allowed disabled:bg-ink/40">
            {savingWindow || savingMode ? 'Saving...' : 'Save window'}
          </button>
        </div>
        {/* Existing scheduling history and lifecycle controls are retained below the Figma editor. */}
        {club.membershipSettings && (
            <div className="mt-6 space-y-3">
              <h3 className="font-semibold">Registration periods</h3>
              {!club.registrationWindows?.length ? (
                <p className="text-sm text-ink-2">No registration windows recorded.</p>
              ) : (
                club.registrationWindows.map((registrationWindow) => {
                  const now = new Date()
                  const opensAt = new Date(registrationWindow.opensAt)
                  const closesAt = new Date(registrationWindow.closesAt)
                  const canEdit =
  club.status === 'ACTIVE' &&
  club.membershipSettings?.registrationMode === 'WINDOWED' &&
  opensAt > now &&
  registrationWindow.closedAt === null &&
  registrationWindow.canceledAt === null &&
  registrationWindow.effectiveFeeVersionId === null

const canClose =
  club.status === 'ACTIVE' &&
  club.membershipSettings?.registrationMode === 'WINDOWED' &&
  opensAt <= now &&
  closesAt > now &&
  registrationWindow.closedAt === null &&
  registrationWindow.canceledAt === null

const status = registrationWindow.canceledAt
  ? 'Canceled'
  : registrationWindow.closedAt
    ? 'Closed early'
    : now < opensAt
      ? 'Scheduled'
      : now >= closesAt
        ? 'Closed'
        : 'Open'

                  return (
                    <div
                      key={registrationWindow.id}
                      className="rounded-xl border border-ink/15 bg-paper p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold">{status}</p>
                        <div className="flex flex-wrap items-center gap-3">
                          {canEdit && (
                            <button
                              type="button"
                              disabled={savingWindow || closingWindowId !== null}
                              onClick={() => {
                                setEditingWindowId(registrationWindow.id)
                                setWindowStart(opensAt.toLocaleDateString('sv-SE'))
                                setWindowEnd(new Date(closesAt.getTime() - 86_400_000).toLocaleDateString('sv-SE'))
                                setWindowError('')
                                setWindowSuccess('')
                              }}
                              className="text-sm font-semibold underline disabled:opacity-40"
                            >
                              Edit
                            </button>
                          )}
                          {canClose && (
                            <button
                              type="button"
                              onClick={() => void closeRegistrationWindow(registrationWindow.id)}
                              disabled={closingWindowId !== null || savingWindow}
                              className="rounded-full border border-rose/40 px-4 py-2 text-sm font-semibold text-rose hover:bg-rose/10 disabled:opacity-40"
                            >
                              {closingWindowId === registrationWindow.id
                                ? 'Closing...'
                                : 'Close registration'}
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-ink-2">
                        Opens: {opensAt.toLocaleString()}
                      </p>
                      <p className="mt-1 text-sm text-ink-2">
                        Closes: {closesAt.toLocaleString()}
                      </p>
                      {registrationWindow.closedAt && (
                        <p className="mt-1 text-sm text-ink-2">
                          Closed early at: {new Date(registrationWindow.closedAt).toLocaleString()}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-ink-2">
                        {registrationWindow.effectiveFeeVersionId
                          ? 'Prices locked'
                          : 'Prices not locked'}
                      </p>
                    </div>
                  )
                })
              )}
            </div>
        )}
      </section>

      <div className="lg:col-span-2">
      <BoardAppointmentsPanel clubId={club.id} accessToken={accessToken} />
      <div className="mt-6" />
      {/* Sprint 3.5: Deanship administrator assignments */}
      <ClubAdministratorsPanel
        clubId={club.id}
        accessToken={accessToken}
      />

      </div>
    <section className="lg:col-span-2 rounded-3xl border border-ink/10 bg-card p-5 sm:p-6">
      <h2 className="mb-4 font-display text-2xl leading-none">Labels</h2>
      <ClubLabelsPicker value={labelSelection} onChange={(next) => { setLabelSelection(next); setLabelsStatus(''); void saveLabels(next) }} disabled={savingLabels} />
      {labelsStatus && <span role="status" className="mt-3 block text-xs text-ink-2">{labelsStatus}</span>}
      {labelsError && <p role="alert" className="mt-3 text-sm text-rose">{labelsError}</p>}
      <p className="mt-3 text-xs text-ink-2">Deanship labels are locked for the club. Use + to create a new label for filtering. Clubs keep control of their own hashtags.</p>
    </section>
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