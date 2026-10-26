import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'

type Position = 'PRESIDENT' | 'SECOND_ADMIN'
type Student = {
  id: string
  universityId: string
  fullName: string
  account: { id: string; role: string; status: string } | null
}
type Assignment = {
  id: string
  clubId: string
  accountId: string
  position: Position
  account: {
    id: string
    email: string
    universityStudent: { fullName: string; universityId: string } | null
  }
}
type Props = { clubId: string; accessToken: string }
const SLOTS: Position[] = ['PRESIDENT', 'SECOND_ADMIN']
const inputCls = 'w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-plum focus:ring-2 focus:ring-plum/20'

async function readError(response: Response) {
  const data: { message?: string | string[] } = await response.json().catch(() => ({}))
  return Array.isArray(data.message) ? data.message.join(' ') : data.message || `Request failed (${response.status})`
}

export default function ClubAdministratorsPanel({ clubId, accessToken }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [selection, setSelection] = useState<Record<Position, string>>({ PRESIDENT: '', SECOND_ADMIN: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const reload = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/clubs/${clubId}/admin-assignments`, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal, cache: 'no-store',
    })
    if (!response.ok) throw new Error(await readError(response))
    const data: Assignment[] = await response.json()
    if (!signal?.aborted) setAssignments(data)
  }, [clubId, accessToken])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setNotice('')
    setSelection({ PRESIDENT: '', SECOND_ADMIN: '' })
    Promise.all([
      fetch(`/api/clubs/${clubId}/admin-assignments`, {
        headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal, cache: 'no-store',
      }),
      fetch('/api/students', {
        headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal, cache: 'no-store',
      }),
    ]).then(async ([a, s]) => {
      if (!a.ok) throw new Error(await readError(a))
      if (!s.ok) throw new Error(await readError(s))
      const [assigned, registered]: [Assignment[], Student[]] = await Promise.all([a.json(), s.json()])
      if (!controller.signal.aborted) {
        setAssignments(assigned)
        setStudents(registered.filter(x => x.account?.role === 'STUDENT' && x.account.status === 'ACTIVE'))
      }
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load administrators')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [clubId, accessToken])

  const byPosition = (p: Position) => assignments.find(a => a.position === p)
  const freeStudents = students.filter(s => s.account && !assignments.some(a => a.accountId === s.account?.id))

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || loading) return
    const pending = SLOTS.filter(p => !byPosition(p) && selection[p])
    if (pending.length === 0) return
    // Each assignment is saved through the authenticated Deanship API.
    setBusy(true)
    setError('')
    setNotice('')
    try {
      for (const position of pending) {
        const response = await fetch(`/api/clubs/${clubId}/admin-assignments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: selection[position], position }),
        })
        if (!response.ok) throw new Error(await readError(response))
        await reload()
      }
      setSelection({ PRESIDENT: '', SECOND_ADMIN: '' })
      setNotice('Club administrator assignments saved.')
    } catch (err) {
      // Reload even if a later request failed: earlier assignments might have succeeded.
      await reload().catch(() => undefined)
      setError(err instanceof Error ? err.message : 'Unable to save administrator assignments')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(a: Assignment) {
    if (busy || !window.confirm('Revoke this administrator’s access? Their student account and club data will remain intact.')) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/clubs/${clubId}/admin-assignments/${a.id}/revoke`, {
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl leading-none">Board and club administration</h2>
      </div>
      {loading ? <p className="text-sm text-ink-2">Loading administrators…</p> : (
        <form onSubmit={save}>
          {/* Same Figma two-column account-holder layout, connected to student accounts. */}
          <div className="mt-5 border-t border-ink/10 pt-4">
            <p className="text-sm font-semibold">Who manages the club?</p>
            <p className="mb-3 text-xs text-ink-2">Two individual student accounts, one President and one Second Administrator. A student may manage only one club.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {SLOTS.map((position, index) => {
                const assignment = byPosition(position)
                return (
                  <label key={position} className="block">
                    <span className="mb-1.5 block text-sm font-semibold">{index === 0 ? 'Club administrator 1 · President' : 'Club administrator 2 · Second Administrator'}</span>
                    {assignment ? (
                      <div className="space-y-2">
                        <div className={`${inputCls} min-h-11`}>
                          <span className="font-semibold">{assignment.account.universityStudent?.fullName ?? assignment.account.email}</span>
                          <span className="mt-1 block text-xs text-ink-2">{assignment.account.universityStudent?.universityId ?? assignment.account.email}</span>
                        </div>
                        <button type="button" disabled={busy} onClick={() => void revoke(assignment)} className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold hover:bg-ink/5 disabled:opacity-50">Revoke access</button>
                      </div>
                    ) : (
                      <select className={inputCls} value={selection[position]} disabled={busy} onChange={e => setSelection(current => ({ ...current, [position]: e.target.value }))}>
                        <option value="">Choose a registered student…</option>
                        {freeStudents.filter(s => s.account?.id !== selection[position === 'PRESIDENT' ? 'SECOND_ADMIN' : 'PRESIDENT']).map(s => (
                          <option key={s.id} value={s.account!.id}>{s.fullName} · {s.universityId}</option>
                        ))}
                      </select>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
          {error && <p role="alert" className="mt-3 text-sm font-medium text-[#8a1f47]">{error}</p>}
          {notice && <p role="status" className="mt-3 text-sm text-ink-2">{notice}</p>}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-ink/10 pt-4">
            <p className="text-xs text-ink-2">Assignments use existing student accounts. Club and historical data are preserved.</p>
            <button type="submit" disabled={busy || !SLOTS.some(p => !byPosition(p) && selection[p])} className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-plum-2 disabled:opacity-50">{busy ? 'Saving…' : 'Save administrators'}</button>
          </div>
        </form>
      )}
    </section>
  )
}