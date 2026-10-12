import { useState } from 'react'
import { Bell, LogOut, Menu, UserRound, X } from 'lucide-react'

type PublicPage = 'home' | 'clubs' | 'events'
type Page = PublicPage | 'dashboard'

type NavbarProps = {
  page: Page
  onHome: () => void
  onClubs: () => void
  onEvents: () => void
  onDashboard: () => void
  onSignIn: () => void
  onSignOut: () => void
  signedInEmail?: string
}

export default function Navbar({ page, onHome, onClubs, onEvents, onDashboard, onSignIn, onSignOut, signedInEmail }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const authenticated = Boolean(signedInEmail)
  const links: { id: Page; label: string; action: () => void }[] = [
    { id: 'home', label: 'Home', action: onHome },
    { id: 'clubs', label: 'Clubs', action: onClubs },
    { id: 'events', label: 'Events', action: onEvents },
    ...(authenticated ? [{ id: 'dashboard' as const, label: 'Dashboard', action: onDashboard }] : []),
  ]
  function navigate(action: () => void) {
    setMenuOpen(false)
    action()
  }
  const desktopLink = (selected: boolean) =>
    `whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-[padding,background-color,color] duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] hover:px-8 motion-reduce:transition-none ${selected ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 sm:px-8">
        <button type="button" onClick={() => navigate(onHome)} className="flex items-center gap-2 font-display text-2xl">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-ink font-display text-lg italic text-butter">CH</span>
          ClubHub
        </button>
        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {links.map((link) => (
            <button key={link.id} type="button" onClick={() => navigate(link.action)} aria-current={page === link.id ? 'page' : undefined} className={desktopLink(page === link.id)}>
              {link.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {authenticated ? (
            <>
              {/* The Figma notification icon. No dummy unread count or fake notifications. */}
              <button type="button" disabled aria-label="Notifications (coming soon)" title="Notifications coming soon" className="relative grid size-10 place-items-center rounded-full opacity-40 cursor-not-allowed">
                <Bell size={19} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => navigate(onDashboard)} aria-label="My dashboard" title={signedInEmail} className="grid size-10 place-items-center rounded-full border-2 border-rose bg-lilac text-ink transition hover:ring-2 hover:ring-rose/40">
                <UserRound size={19} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => navigate(onSignOut)} aria-label="Sign out" title="Sign out" className="hidden size-10 place-items-center rounded-full transition hover:bg-paper-2 md:grid">
                <LogOut size={18} aria-hidden="true" />
              </button>
            </>
          ) : (
            <button type="button" onClick={() => navigate(onSignIn)} className="inline-flex items-center justify-center rounded-full bg-ink px-3.5 py-1.5 text-sm font-semibold text-paper transition-colors hover:bg-plum-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose">Sign in</button>
          )}
          <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="mobile-navigation" className="grid size-10 place-items-center rounded-full hover:bg-ink/10 md:hidden">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t border-ink/10 bg-paper px-5 py-4 sm:px-8 md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1">
            {links.map((link) => (
              <button key={link.id} type="button" onClick={() => navigate(link.action)} aria-current={page === link.id ? 'page' : undefined} className={`rounded-xl px-4 py-3 text-left font-display text-3xl ${page === link.id ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`}>
                {link.label}
              </button>
            ))}
            {authenticated && <button type="button" onClick={() => navigate(onSignOut)} className="rounded-xl px-4 py-3 text-left text-sm font-semibold text-ink-2">Sign out</button>}
          </div>
        </nav>
      )}
    </header>
  )
} 