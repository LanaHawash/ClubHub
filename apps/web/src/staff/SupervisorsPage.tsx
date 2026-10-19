import { useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
type Supervisor = {
  id: string
  fullName: string
  faculty: {
    id: string
    name: string
  }
  account: {
    id: string
    email: string
    status: 'ACTIVE' | 'DISABLED'
  }
}

type Faculty = {
  id: string
  name: string
}
type Props = {
  accessToken: string
}

export default function SupervisorsPage({ accessToken }: Props) {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [faculties, setFaculties] = useState<Faculty[]>([])

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [facultyId, setFacultyId] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [updatingSupervisorId, setUpdatingSupervisorId] = useState<string | null>(null)
  const [statusError, setStatusError] = useState('')
  const [editingSupervisor, setEditingSupervisor] =
    useState<Supervisor | null>(null)

  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editFacultyId, setEditFacultyId] = useState('')

  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')
  useEffect(() => {
    const controller = new AbortController()

    async function loadSupervisors() {
      setLoading(true)
      setError('')

      try {
        const response = await fetch('/api/supervisors', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? 'Your session has expired. Please sign in again.'
              : response.status === 403
                ? 'You do not have permission to manage supervisors.'
                : 'Unable to load supervisors.'
          )
        }

        const data: Supervisor[] = await response.json()

        if (!controller.signal.aborted) {
          setSupervisors(data)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load supervisors.'
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadSupervisors()

    return () => controller.abort()
  }, [accessToken, refreshKey])

    useEffect(() => {
      const controller = new AbortController()

      async function loadFaculties() {
        try {
          const response = await fetch('/api/university/faculties', {
            signal: controller.signal,
          })

          if (!response.ok) {
            throw new Error('Unable to load faculties.')
          }

          const data: Faculty[] = await response.json()

          if (!controller.signal.aborted) {
            setFaculties(data)
          }
        } catch {
          if (!controller.signal.aborted) {
            setFormError('Unable to load faculties. Please refresh the page.')
          }
        }
      }

      void loadFaculties()

      return () => controller.abort()
    }, [])

    async function handleCreateSupervisor(
      event: FormEvent<HTMLFormElement>,
    ) {
      event.preventDefault()

      if (submitting) return

      setFormError('')
      setFormSuccess('')

      const normalizedName = fullName.trim()
      const normalizedEmail = email.trim().toLowerCase()

      if (!normalizedName || !normalizedEmail || !facultyId) {
        setFormError('Please complete all required fields.')
        return
      }

      if (password.length < 8) {
        setFormError('Password must contain at least 8 characters.')
        return
      }

      setSubmitting(true)

      try {
        const response = await fetch('/api/supervisors', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            fullName: normalizedName,
            email: normalizedEmail,
            password,
            facultyId,
          }),
        })

        if (!response.ok) {
          if (response.status === 409) {
            throw new Error('This email is already registered.')
          }

          if (response.status === 401) {
            throw new Error('Your session has expired. Please sign in again.')
          }

          if (response.status === 403) {
            throw new Error('You do not have permission to create supervisors.')
          }

          throw new Error('Unable to create supervisor. Please try again.')
        }

        setFullName('')
        setEmail('')
        setPassword('')
        setFacultyId('')

        setFormSuccess('Supervisor account created successfully.')

        // Reload the supervisor table.
        setRefreshKey((previous) => previous + 1)
      } catch (error) {
        setFormError(
          error instanceof Error
            ? error.message
            : 'Unable to create supervisor.',
        )
      } finally {
        setSubmitting(false)
      }
    }
    async function handleUpdateStatus(supervisor: Supervisor) {
  if (updatingSupervisorId) return

  const isActive = supervisor.account.status === 'ACTIVE'
  const nextStatus = isActive ? 'DISABLED' : 'ACTIVE'

  const confirmed = window.confirm(
    isActive
      ? `Deactivate ${supervisor.fullName}? This supervisor will no longer be able to sign in.`
      : `Reactivate ${supervisor.fullName}? This supervisor will be able to sign in again.`
  )

  if (!confirmed) return

  setUpdatingSupervisorId(supervisor.id)
  setStatusError('')

  try {
    const response = await fetch(
      `/api/supervisors/${supervisor.id}/status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          status: nextStatus,
        }),
      }
    )

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Your session has expired. Please sign in again.')
      }

      if (response.status === 403) {
        throw new Error('You do not have permission to manage supervisors.')
      }

      if (response.status === 404) {
        throw new Error('Supervisor account not found.')
      }

      throw new Error('Unable to update supervisor status.')
    }

    // Refresh the supervisor table using database data.
    setRefreshKey((previous) => previous + 1)
  } catch (error) {
    setStatusError(
      error instanceof Error
        ? error.message
        : 'Unable to update supervisor status.'
    )
  } finally {
    setUpdatingSupervisorId(null)
  }
}
function handleOpenEdit(supervisor: Supervisor) {
  setEditingSupervisor(supervisor)

  setEditName(supervisor.fullName)
  setEditEmail(supervisor.account.email)
  setEditFacultyId(supervisor.faculty.id)

  setEditError('')
}
function handleCloseEdit() {
  if (savingEdit) return

  setEditingSupervisor(null)
  setEditError('')
}
  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingSupervisor || savingEdit) return

    setEditError('')
    const normalizedName = editName.trim()
    const normalizedEmail = editEmail.trim().toLowerCase()
    if (!normalizedName || !normalizedEmail || !editFacultyId) {
      setEditError('Please complete all required fields.')
      return
    }

    setSavingEdit(true)
    try {
      const response = await fetch(`/api/supervisors/${editingSupervisor.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          fullName: normalizedName,
          email: normalizedEmail,
          facultyId: editFacultyId,
        }),
      })

      if (!response.ok) {
        if (response.status === 409) throw new Error('This email is already registered.')
        if (response.status === 400) throw new Error('Please check the information entered.')
        if (response.status === 401) throw new Error('Session expired. Please sign in again.')
        if (response.status === 403) throw new Error('You do not have permission to edit supervisors.')
        if (response.status === 404) throw new Error('Supervisor not found.')
        throw new Error('Unable to update supervisor information.')
      }

      setEditingSupervisor(null)
      setRefreshKey((previous) => previous + 1)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Unable to update supervisor.')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <section className="mx-auto max-w-5xl anim-rise">

      {/* FIGMA PAGE HEADING */}
      <div className="mb-8">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">
          Supervisors
        </p>

        <h1 className="font-display text-5xl leading-tight sm:text-6xl">
          Who supervises what
        </h1>

        <p className="mt-3 text-ink-2">
          Create supervisor accounts here, then assign them to
          clubs from each club&apos;s page. A deactivated
          supervisor cannot sign in.
        </p>
      </div>
      {/* FIGMA: NEW SUPERVISOR */}
      <div className="mb-8 rounded-3xl border border-ink/10 bg-card p-6 sm:p-8">

        <div className="mb-6">
          <h2 className="font-display text-3xl">
            New supervisor
          </h2>

          <p className="mt-2 text-sm text-ink-2">
            Create a supervisor account for your university.
          </p>
        </div>

        <form
          onSubmit={handleCreateSupervisor}
          className="grid gap-4 sm:grid-cols-2"
        >
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">
              Full name
            </span>

            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Supervisor's full name"
              autoComplete="name"
              required
              disabled={submitting}
              className="w-full rounded-xl border border-line bg-paper px-4 py-3 outline-none focus:border-plum focus:ring-2 focus:ring-plum/20"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold">
              Email
            </span>

            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="supervisor@university.edu"
              autoComplete="off"
              required
              disabled={submitting}
              className="w-full rounded-xl border border-line bg-paper px-4 py-3 outline-none focus:border-plum focus:ring-2 focus:ring-plum/20"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold">
              Faculty
            </span>

            <select
              value={facultyId}
              onChange={(event) => setFacultyId(event.target.value)}
              required
              disabled={submitting}
              className="w-full rounded-xl border border-line bg-paper px-4 py-3 outline-none focus:border-plum focus:ring-2 focus:ring-plum/20"
            >
              <option value="">Select a faculty</option>

              {faculties.map((faculty) => (
                <option key={faculty.id} value={faculty.id}>
                  {faculty.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold">
              Initial password
            </span>

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
              disabled={submitting}
              className="w-full rounded-xl border border-line bg-paper px-4 py-3 outline-none focus:border-plum focus:ring-2 focus:ring-plum/20"
            />
          </label>

          {formError && (
            <p
              role="alert"
              className="rounded-xl bg-rose/10 p-4 text-sm text-rose sm:col-span-2"
            >
              {formError}
            </p>
          )}

          {formSuccess && (
            <p
              role="status"
              className="rounded-xl bg-mint/30 p-4 text-sm text-ink sm:col-span-2"
            >
              {formSuccess}
            </p>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting || faculties.length === 0}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper transition hover:bg-plum-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={18} aria-hidden="true" />

              {submitting
                ? 'Creating supervisor...'
                : 'Create supervisor'}
            </button>
          </div>
        </form>
      </div>

      {/* SUPERVISORS TABLE */}
      {statusError && (
  <div
    role="alert"
    className="mb-4 rounded-xl border border-rose/30 bg-rose/10 p-4 text-sm text-rose"
  >
    {statusError}
  </div>
)}
      <div className="overflow-x-auto rounded-3xl border border-ink/10 bg-card">

        <table className="w-full min-w-[38rem] text-left text-sm">

          <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-ink-2">
            <tr>
              <th className="p-4 font-semibold">Supervisor</th>
              <th className="p-4 font-semibold">Clubs</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4" scope="col">
                <span className="sr-only">Supervisor account controls</span>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-ink/10">

            {loading && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-ink-2">
                  Loading supervisors...
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-rose">
                  {error}
                </td>
              </tr>
            )}

            {!loading && !error && supervisors.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-ink-2">
                  No supervisors have been created yet.
                </td>
              </tr>
            )}

            {!loading && !error && supervisors.map((supervisor) => {
              const active = supervisor.account.status === 'ACTIVE'

              return (
                <tr key={supervisor.id}>

                  <td className="p-4">
                    <p className="font-semibold">
                      {supervisor.fullName}
                    </p>

                    <p className="text-xs text-ink-2">
                      {supervisor.account.email}
                    </p>

                    <p className="mt-1 text-xs text-ink-2">
                      {supervisor.faculty.name}
                    </p>
                  </td>

                  <td className="p-4">
                    <span className="text-ink-2">
                      Not assigned yet
                    </span>
                  </td>

                  <td className="p-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        active
                          ? 'bg-mint text-[#16342a]'
                          : 'bg-ink/10 text-ink-2'
                      }`}
                    >
                      {active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>

                  <td className="p-4 text-right">
  <div className="flex items-center justify-end gap-2">
    <button
      type="button"
      onClick={() => handleOpenEdit(supervisor)}
      disabled={updatingSupervisorId !== null}
      className="rounded-full border border-ink/20 px-4 py-2 text-xs font-semibold transition hover:bg-ink/5 disabled:opacity-50"
    >
      Edit
    </button>
  <button
    type="button"
    onClick={() => void handleUpdateStatus(supervisor)}
    disabled={updatingSupervisorId !== null}
    className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
      active
        ? 'border-rose/30 text-rose hover:bg-rose/10'
        : 'border-ink/20 bg-ink text-paper hover:bg-plum-2'
    }`}
  >
    {updatingSupervisorId === supervisor.id
      ? 'Updating...'
      : active
        ? 'Deactivate'
        : 'Reactivate'}
  </button>
  </div>
</td>

                </tr>
              )
            })}

          </tbody>
        </table>
      </div>

      {editingSupervisor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) handleCloseEdit()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') handleCloseEdit()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-supervisor-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-paper p-6 shadow-2xl sm:p-8"
          >
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-rose">
              Supervisor management
            </p>
            <h2 id="edit-supervisor-title" className="font-display text-3xl text-ink">
              Edit supervisor
            </h2>
            <p className="mt-2 text-sm text-ink-2">Update the supervisor's account information.</p>
            <form onSubmit={handleSaveEdit} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Full name</span>
                <input
                  autoFocus
                  type="text"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  required
                  disabled={savingEdit}
                  className="w-full rounded-xl border border-line bg-card px-4 py-3 outline-none focus:border-plum focus:ring-2 focus:ring-plum/20"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Email</span>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(event) => setEditEmail(event.target.value)}
                  required
                  disabled={savingEdit}
                  className="w-full rounded-xl border border-line bg-card px-4 py-3 outline-none focus:border-plum focus:ring-2 focus:ring-plum/20"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Faculty</span>
                <select
                  value={editFacultyId}
                  onChange={(event) => setEditFacultyId(event.target.value)}
                  required
                  disabled={savingEdit}
                  className="w-full rounded-xl border border-line bg-card px-4 py-3 outline-none focus:border-plum focus:ring-2 focus:ring-plum/20"
                >
                  <option value="">Select a faculty</option>
                  {faculties.map((faculty) => (
                    <option key={faculty.id} value={faculty.id}>{faculty.name}</option>
                  ))}
                </select>
              </label>
              {editError && (
                <p role="alert" className="rounded-xl bg-rose/10 p-4 text-sm text-rose">
                  {editError}
                </p>
              )}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  disabled={savingEdit}
                  className="rounded-full border border-ink/20 px-6 py-3 text-sm font-semibold hover:bg-ink/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || faculties.length === 0}
                  className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper hover:bg-plum-2 disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}