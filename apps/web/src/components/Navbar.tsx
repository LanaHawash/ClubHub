import { useState } from 'react'
import { Menu, X } from 'lucide-react'

type NavbarProps = {
  page: 'home' | 'clubs' | 'events'
  onHome: () => void
  onClubs: () => void
  onEvents: () => void
  onSignIn: () => void
}

export default function Navbar({
  page,
  onHome,
  onClubs,
  onEvents,
  onSignIn,
}: NavbarProps) {
    const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 sm:px-8">
        <button
          type="button"
          onClick={onHome}
          className="flex items-center gap-2"
        >
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-full bg-ink font-display text-lg italic text-butter"
          >
            CH
          </span>

          <span className="font-display text-2xl">ClubHub</span>
        </button>

        <nav
          aria-label="Main navigation"
          className="ml-6 hidden items-center gap-1 md:flex"
        >
          <button
            type="button"
            onClick={onHome}
            aria-current={page === 'home' ? 'page' : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-[padding,background-color,color] duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] hover:px-8 motion-reduce:transition-none ${
            page === 'home'
                ? 'bg-ink text-paper'
                : 'hover:bg-ink/10'
            }`}
          >
            Home
          </button>

          <button
            type="button"
            onClick={onClubs}
            className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-[padding,background-color,color] duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] hover:px-8 motion-reduce:transition-none hover:bg-ink/10"
          >
            Clubs
          </button>

          <button
            type="button"
            onClick={onEvents}
            aria-current={page === 'events' ? 'page' : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-[padding,background-color,color] duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] hover:px-8 motion-reduce:transition-none ${
            page === 'events'
                ? 'bg-ink text-paper'
                : 'hover:bg-ink/10'
            }`}
          >
            Events
          </button>
        </nav>

        <button
        type="button"
        onClick={onSignIn}
        className="ml-auto inline-flex items-center justify-center gap-2 rounded-full bg-ink px-3.5 py-1.5 text-sm font-semibold text-paper transition-colors duration-200 hover:bg-plum-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose"
        >
        Sign in
        </button>
        <button
  type="button"
  onClick={() => setMenuOpen((open) => !open)}
  aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
  aria-expanded={menuOpen}
  aria-controls="mobile-navigation"
  className="inline-flex items-center justify-center rounded-full p-2 text-ink transition-colors hover:bg-ink/10 md:hidden"
>
  {menuOpen ? <X size={22} /> : <Menu size={22} />}
</button>
            </div>

      {menuOpen && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="border-t border-ink/10 bg-paper px-5 py-4 sm:px-8 md:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-1">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onHome()
              }}
              aria-current={page === 'home' ? 'page' : undefined}
              className={`rounded-xl px-4 py-3 text-left font-display text-3xl ${
                page === 'home'
                  ? 'bg-ink text-paper'
                  : 'text-ink hover:bg-ink/10'
              }`}
            >
              Home
            </button>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onClubs()
              }}
              aria-current={page === 'clubs' ? 'page' : undefined}
              className={`rounded-xl px-4 py-3 text-left font-display text-3xl ${
                page === 'clubs'
                  ? 'bg-ink text-paper'
                  : 'text-ink hover:bg-ink/10'
              }`}
            >
              Clubs
            </button>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onEvents()
              }}
              aria-current={page === 'events' ? 'page' : undefined}
              className={`rounded-xl px-4 py-3 text-left font-display text-3xl ${
                page === 'events'
                  ? 'bg-ink text-paper'
                  : 'text-ink hover:bg-ink/10'
              }`}
            >
              Events
            </button>
          </div>
        </nav>
      )}
    </header>
  )
}