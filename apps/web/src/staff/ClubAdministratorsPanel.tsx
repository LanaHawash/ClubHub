import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'

type Position = 'PRESIDENT' | 'SECOND_ADMIN'
type BoardAppointment = {
  id: string
  studentId: string
  position: string
  startDate: string
  endDate: string | null
  endedAt?: string | null
  student: { fullName: string; universityId: string }
}
type Assignment = {
  id: string
  clubId: string
  accountId: string
  boardAppointmentId?: string | null
  position: Position
  account: {
    id: string
    email: string
    universityStudent: { id?: string; fullName: string; universityId: string } | null
  }
}
type Props = { clubId: string; accessToken: string }
const SLOTS: Position[] = ['PRESIDENT', 'SECOND_ADMIN']
const inputCls = 'w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-plum focus:ring-2 focus:ring-plum/20'

async function readError(response: Response): Promise<string> {
  const data: { message?: string | string[] } = await response.json().catch(() => ({}))
  return Array.isArray(data.message) ? data.message.join(' ') : data.message || `Request failed (${response.status})`
}

export default function ClubAdministratorsPanel({ clubId, accessToken }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [board, setBoard] = useState<BoardAppointment[]>([])
  const [selection, setSelection] = useState<Record<Position, string>>({ PRESIDENT: '', SECOND_ADMIN: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const reload = useCallback(async (signal?: AbortSignal) => {
    const headers = { Authorization: `Bearer ${accessToken}` }
    const [assignmentsResponse, boardResponse] = await Promise.all([
      fetch(`/api/clubs/${clubId}/admin-assignments`, { headers, signal, cache: 'no-store' }),
      fetch(`/api/clubs/${clubId}/board`, { headers, signal, cache: 'no-store' }),
    ])
    if (!assignmentsResponse.ok) throw new Error(await readError(assignmentsResponse))
    if (!boardResponse.ok) throw new Error(await readError(boardResponse))
    const [assigned, members]: [Assignment[], BoardAppointment[]] = await Promise.all([
      assignmentsResponse.json(), boardResponse.json(),
    ])
    if (!signal?.aborted) {
      setAssignments(assigned)
      setBoard(members)
    }
  }, [clubId, accessToken])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setNotice('')
    setSelection({ PRESIDENT: '', SECOND_ADMIN: '' })
    reload(controller.signal)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load club administration')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])

  // Refresh after board appointments are changed in the adjacent panel.
  useEffect(() => {
    const onFocus = () => { if (!busy) void reload().catch(() => undefined) }
    window.addEventListener('focus', onFocus)
    window.addEventListener('clubhub:board-changed', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('clubhub:board-changed', onFocus)
    }
  }, [reload, busy])

  const byPosition = (position: Position) => assignments.find((a) => a.position === position)
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const currentBoard = board.filter((m) => !m.endedAt && m.startDate.slice(0, 10) <= today && (!m.endDate || m.endDate.slice(0, 10) >= today))
  const assignedStudentIds = new Set(assignments.map((a) => a.account.universityStudent?.id).filter(Boolean))
  const assignedBoardIds = new Set(assignments.map((a) => a.boardAppointmentId).filter(Boolean))

  function optionsFor(position: Position) {
    const opposite = position === 'PRESIDENT' ? 'SECOND_ADMIN' : 'PRESIDENT'
    return currentBoard.filter((member) =>
      !assignedBoardIds.has(member.id) &&
      !assignedStudentIds.has(member.studentId) &&
      member.id !== selection[opposite] &&
      !currentBoard.some((selected) => selected.id === selection[opposite] && selected.studentId === member.studentId),
    )
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || loading) return
    const pending = SLOTS.filter((position) => !byPosition(position) && selection[position])
    if (!pending.length) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      for (const position of pending) {
        const response = await fetch(`/api/clubs/${clubId}/admin-assignments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ boardAppointmentId: selection[position], position }),
        })
        if (!response.ok) throw new Error(await readError(response))
        await reload()
      }
      setSelection({ PRESIDENT: '', SECOND_ADMIN: '' })
      setNotice('Club administrator assignments saved.')
    } catch (err) {
      await reload().catch(() => undefined)
      setError(err instanceof Error ? err.message : 'Unable to save administrators')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(assignment: Assignment) {
    if (busy || !window.confirm('Revoke this administrator’s access? Their student account and club history will remain intact.')) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/clubs/${clubId}/admin-assignments/${assignment.id}/revoke`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error(await readError(response))
      await reload()
      setNotice('Administrator access revoked.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke administrator')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-3xl border border-ink/10 bg-card p-5 sm:p-6 lg:col-span-2">
      <h2 className="font-display text-2xl leading-none">Club administration</h2>
      {loading ? <p className="mt-5 text-sm text-ink-2">Loading administrators…</p> : (
        <form onSubmit={save}>
          <div className="mt-5 border-t border-ink/10 pt-4">
            <p className="text-sm font-semibold">Who manages the club?</p>
            <p className="mb-3 text-xs text-ink-2">Choose up to two current board members. One President and one Second Administrator. Board position and administrator permission are separate.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {SLOTS.map((position, index) => {
                const assignment = byPosition(position)
                return (
                  <div key={position}>
                    <label htmlFor={`board-admin-${position}`} className="mb-1.5 block text-sm font-semibold">
                      {index === 0 ? 'Club administrator 1 · President' : 'Club administrator 2 · Second Administrator'}
                    </label>
                    {assignment ? (
                      <div className="space-y-2">
                        <div className={`${inputCls} min-h-11`}>
                          <span className="font-semibold">{assignment.account.universityStudent?.fullName ?? assignment.account.email}</span>
                          <span className="mt-1 block text-xs text-ink-2">{assignment.account.universityStudent?.universityId ?? assignment.account.email}</span>
                        </div>
                        <button type="button" disabled={busy} onClick={() => void revoke(assignment)} className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold hover:bg-ink/5 disabled:opacity-50">Revoke access</button>
                      </div>
                    ) : (
                      <select id={`board-admin-${position}`} className={inputCls} value={selection[position]} disabled={busy} onChange={(e) => setSelection((previous) => ({ ...previous, [position]: e.target.value }))}>
                        <option value="">Choose from current board…</option>
                        {optionsFor(position).map((member) => (
                          <option key={member.id} value={member.id}>{member.student.fullName} · {member.student.universityId} · {member.position}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
            {currentBoard.length === 0 && <p className="mt-3 text-xs text-ink-2">Add an eligible board member first, then assign administrator access.</p>}
          </div>
          {error && <p role="alert" className="mt-3 text-sm font-medium text-[#8a1f47]">{error}</p>}
          {notice && <p role="status" className="mt-3 text-sm text-ink-2">{notice}</p>}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-ink/10 pt-4">
            <p className="text-xs text-ink-2">Administrators are selected only from current board appointments. Historical records are preserved.</p>
            <button type="submit" disabled={busy || !SLOTS.some((position) => !byPosition(position) && selection[position])} className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-plum-2 disabled:opacity-50">{busy ? 'Saving…' : 'Save administrators'}</button>
          </div>
        </form>
      )}
    </section>
  )
}
