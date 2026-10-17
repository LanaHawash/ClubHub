import { useEffect, useState } from 'react'
import { GraduationCap, Hash, Lock, Mail, QrCode, UserRound } from 'lucide-react'

type StudentProfileData = {
  id: string
  universityId: string
  email: string
  fullName: string
  major: { id: string; name: string; faculty: { id: string; name: string } }
  account: { id: string; role: string; status: string; profilePhotoUrl: string | null } | null
}

type StudentProfileProps = {
  accessToken: string
  onBack: () => void
}

const words = [
  ['MEMBER', 'left-[4%] top-[14%]'],
  ['DEBATER', 'right-[3%] top-[22%]'],
  ['BUILDER', 'left-[6%] bottom-[18%]'],
  ['STORYTELLER', 'right-[2%] bottom-[12%]'],
] as const

export default function StudentProfile({ accessToken, onBack }: StudentProfileProps) {
  const [profile, setProfile] = useState<StudentProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/students/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Unable to load your student profile.')
        const data: StudentProfileData = await response.json()
        if (!controller.signal.aborted) setProfile(data)
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Unable to load profile.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [accessToken])

  if (loading) return <main className="mx-auto max-w-7xl px-5 py-16" role="status">Loading your profile...</main>
  if (error || !profile) return (
    <main className="mx-auto max-w-7xl px-5 py-16">
      <p role="alert" className="text-rose">{error || 'Student profile unavailable.'}</p>
      <button type="button" onClick={onBack} className="mt-5 underline">Back to dashboard</button>
    </main>
  )

  const firstName = profile.fullName.trim().split(/\s+/)[0] ?? ''
  const rows = [
    { label: 'Major', value: profile.major.name, Icon: GraduationCap },
    { label: 'Faculty', value: profile.major.faculty.name, Icon: GraduationCap },
    { label: 'University ID', value: profile.universityId, Icon: Hash },
    { label: 'Email', value: profile.email, Icon: Mail },
  ]

  return (
    <div>
      {/* Figma profile hero: purple stage and hanging member badge. */}
      <section className="grain relative overflow-hidden bg-plum text-white">
        <div aria-hidden="true" className="absolute left-1/2 top-1/3 size-[40rem] -translate-x-1/2 rounded-full bg-rose/25 blur-3xl" />
        <p
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-6 select-none text-center font-display text-[22vw] leading-none text-white/[0.05]"
        >
        {firstName.toUpperCase()}
        </p>
        {words.map(([word, position]) => (
          <span key={word} aria-hidden="true" className={`absolute hidden font-sans text-3xl font-extrabold tracking-tight text-white/90 md:block xl:text-5xl ${position}`}>{word}</span>
        ))}
        <div className="relative mx-auto flex max-w-7xl flex-col items-center px-5 pb-20 pt-10 sm:px-8">
          <div className="anim-sway">
            <div className="mx-auto h-28 w-7 rounded-b bg-rose-soft shadow-md" />
            <div className="-mt-1 mx-auto h-3 w-16 rounded-full bg-lilac/70" />
            <div className="w-72 rounded-[2rem] border-[5px] border-lilac/70 bg-paper p-4 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
              <div className="relative grid h-52 place-items-center overflow-hidden rounded-2xl bg-lilac">
                {profile.account?.profilePhotoUrl ? (
                  <img src={profile.account.profilePhotoUrl} alt={`${profile.fullName}'s profile`} className="h-full w-full object-cover" />
                ) : <UserRound size={90} strokeWidth={1.3} aria-label="Default profile picture" />}
              </div>
              <div className="flex items-end justify-between gap-3 pt-4">
                <div className="min-w-0">
                  <p className="truncate font-sans text-4xl font-extrabold leading-none tracking-tight">{firstName.toUpperCase()}</p>
                  <p className="mt-1 text-sm font-semibold">{profile.major.name}</p>
                  <p className="text-xs text-ink-2">{profile.major.faculty.name}</p>
                </div>
                <QrCode size={44} strokeWidth={1.4} className="shrink-0" aria-hidden="true" />
              </div>
              <div className="mt-3 rounded-xl bg-rose-soft px-3 py-2 font-mono text-xs">ID {profile.universityId}</div>
            </div>
          </div>
          <h1 className="mt-10 text-center font-display text-6xl sm:text-7xl">{profile.fullName}</h1>
          <p className="mt-2 text-center text-white/70">{profile.major.name}, {profile.major.faculty.name}</p>
          <p className="mt-4 text-xs text-white/50">Your photo will appear on future membership cards.</p>
        </div>
      </section>

      {/* Figma details card. No mock memberships, activities, or certificates. */}
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <section className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-rose">Student record</p>
            <h2 className="mb-6 mt-2 font-display text-5xl">Details</h2>
            <dl className="divide-y divide-ink/10 rounded-3xl border border-ink/10 bg-card">
              {rows.map(({ label, value, Icon }) => (
                <div key={label} className="flex items-center gap-4 p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-paper-2"><Icon size={16} /></span>
                  <div className="min-w-0">
                    <dt className="text-xs uppercase tracking-wider text-ink-2">{label}</dt>
                    <dd className="break-words font-semibold">{value}</dd>
                  </div>
                  <Lock size={14} className="ml-auto shrink-0 text-ink-2/60" aria-label="Read-only field" />
                </div>
              ))}
            </dl>
            <p className="mt-3 flex items-start gap-2 text-sm text-ink-2">
              <Lock size={14} className="mt-0.5 shrink-0" />
              Your academic records are read-only and provided by the university.
            </p>
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-rose">Involvement</p>
            <h2 className="mb-6 mt-2 font-display text-5xl">Clubs I'm in</h2>
            <div className="rounded-3xl border border-dashed border-ink/25 bg-card p-8 text-ink-2">
              Memberships will appear here once the membership feature is implemented.
            </div>
            <button type="button" onClick={onBack} className="mt-5 rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold hover:bg-paper-2">Back to dashboard</button>
          </div>
        </section>
      </div>
    </div>
  )
}