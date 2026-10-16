import { useState } from 'react'
import { ArrowLeft, Bell, CheckCheck, LayoutDashboard, LogOut, School, UserCog, Users } from 'lucide-react'

type Section = 'overview' | 'notifications' | 'approvals' | 'clubs' | 'supervisors'

type Props = {
  onStudentSite: () => void
  onSignOut: () => void
}

const navigation = [
  { key: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { key: 'notifications', label: 'Notifications', Icon: Bell },
  { key: 'approvals', label: 'Approvals', Icon: CheckCheck },
  { key: 'clubs', label: 'Clubs', Icon: School },
  { key: 'supervisors', label: 'Supervisors', Icon: UserCog },
] as const

// Figma's StaffApp layout is reproduced here. The section bodies will be
// migrated from the Figma reference next, using actual ClubHub API data.
export default function DeanshipApp({ onStudentSite, onSignOut }: Props) {
  const [section, setSection] = useState<Section>('overview')

  return (
    <div className="min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="border-b border-ink/10 bg-ink text-paper lg:sticky lg:top-0 lg:h-screen lg:border-b-0">
        <div className="flex h-full flex-col gap-4 p-4 lg:gap-6 lg:p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-butter font-display text-xl italic text-ink">
              <Users size={22} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-2xl leading-none">Deanship</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-paper/60">Student Affairs</p>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Deanship administration">
            {navigation.map(({ key, label, Icon }) => {
              const active = section === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSection(key)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-3 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition ${active ? 'bg-paper text-ink' : 'hover:bg-paper/10'}`}
                >
                  <Icon size={17} aria-hidden="true" />{label}
                </button>
              )
            })}
          </nav>
          <div className="mt-auto hidden space-y-1 lg:block">
            <button type="button" onClick={onStudentSite} className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold text-paper/70 hover:bg-paper/10">
              <ArrowLeft size={17} aria-hidden="true" /> Student site
            </button>
            <button type="button" onClick={onSignOut} className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold text-paper/70 hover:bg-paper/10">
              <LogOut size={17} aria-hidden="true" /> Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-5xl anim-rise">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-rose">Deanship</p>
          <h1 className="font-display text-5xl leading-tight sm:text-6xl">
            {section === 'overview' ? <>Good to see you, <em className="text-rose">Dean&apos;s office</em>.</> : navigation.find((item) => item.key === section)?.label}
          </h1>
          <p className="mt-3 text-ink-2">
            {section === 'overview'
              ? 'Every club, every event waiting on a decision, and who supervises what.'
              : 'This section will be connected to its corresponding Figma screen and ClubHub API.'}
          </p>
        </div>
        <div className="mx-auto mt-10 flex max-w-5xl gap-4 text-sm font-semibold text-ink-2 lg:hidden">
          <button type="button" onClick={onStudentSite}>Student site</button>
          <button type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </main>
    </div>
  )
}