import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'

type Label = { id: string; name: string }

export type ClubLabelsSelection = {
  labelIds: string[]
  newLabels: string[]
}

type Props = {
  value: ClubLabelsSelection
  onChange: (next: ClubLabelsSelection) => void
  /** Increment to re-fetch the catalog after another club is saved. */
  refreshKey?: number
  disabled?: boolean
}

// Exact pill, +, input and button classes come from Figma Make src/staff/Clubs.tsx.
// Only state and data-loading behavior have been adapted for the real API.
export default function ClubLabelsPicker({ value, onChange, refreshKey, disabled = false }: Props) {
  const [catalog, setCatalog] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    fetch('/api/labels', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Unable to load labels (${res.status})`)
        return (await res.json()) as Label[]
      })
      .then(setCatalog)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : 'Unable to load labels')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refreshKey])

  const selectedIds = useMemo(() => new Set(value.labelIds), [value.labelIds])
  const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

  const toggle = (id: string) => {
    onChange({ ...value, labelIds: selectedIds.has(id) ? value.labelIds.filter((x) => x !== id) : [...value.labelIds, id] })
  }

  const add = () => {
    const name = text.trim().replace(/\s+/g, ' ')
    if (name.length < 2 || name.length > 80 || !/^[\p{L}\p{N}][\p{L}\p{N}\s&+.'/-]*$/u.test(name)) {
      setError('Use 2–80 characters and a valid label name.')
      return
    }
    const match = catalog.find((label) => key(label.name) === key(name))
    if (match) {
      onChange({ ...value, labelIds: [...new Set([...value.labelIds, match.id])] })
    } else if (!value.newLabels.some((label) => key(label) === key(name))) {
      onChange({ ...value, newLabels: [...value.newLabels, name] })
    }
    setText('')
    setError(null)
    setOpen(false)
  }

  const close = () => { setOpen(false); setText(''); setError(null) }
  const pill = (active: boolean) =>
    'rounded-full border px-3 py-1.5 text-sm font-semibold ' +
    (active ? 'border-ink bg-ink text-paper' : 'border-ink/20 hover:border-ink')

  return (
    <div>
      <p className="mb-2 mt-6 text-sm font-semibold">Labels</p>
      {loading && <p className="text-sm text-ink-2">Loading labels…</p>}
      {loadError && <p role="alert" className="text-sm text-[#8a1f47]">{loadError}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {catalog.map((label) => (
          <button key={label.id} type="button" disabled={disabled} aria-pressed={selectedIds.has(label.id)}
            onClick={() => toggle(label.id)} className={pill(selectedIds.has(label.id))}>
            #{label.name}
          </button>
        ))}
        {value.newLabels.map((name) => (
          <button key={key(name)} type="button" disabled={disabled} aria-pressed="true"
            title="Remove pending label" className={pill(true)}
            onClick={() => onChange({ ...value, newLabels: value.newLabels.filter((x) => key(x) !== key(name)) })}>
            #{name} ×
          </button>
        ))}
        {!open ? (
          <button type="button" disabled={disabled} onClick={() => setOpen(true)}
            aria-label="Add a custom label" title="Add a custom label"
            className="grid size-9 place-items-center rounded-full border border-dashed border-ink/40 text-ink-2 transition hover:border-ink hover:bg-ink hover:text-paper">
            <Plus size={16} />
          </button>
        ) : (
          <div className="w-full">
            <div className="flex max-w-sm gap-2">
              <input autoFocus className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3 text-[15px] outline-none transition placeholder:text-ink/40 focus:border-ink focus:ring-4 focus:ring-rose/25"
                placeholder="New label, e.g. Gaming" value={text} disabled={disabled}
                onChange={(event) => { setText(event.target.value); setError(null) }}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add() }; if (event.key === 'Escape') close() }}
                aria-label="New label" />
              <button type="button" disabled={disabled} onClick={add}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-ink/25 text-ink hover:bg-ink hover:text-paper px-3.5 py-1.5 text-sm font-semibold transition-colors duration-200">Add</button>
              <button type="button" disabled={disabled} aria-label="Cancel" onClick={close}
                className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-ink/10"><X size={16} /></button>
            </div>
            {error && <p role="alert" className="mt-1 text-sm font-medium text-[#8a1f47]">{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}