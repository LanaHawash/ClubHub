import { useEffect, useRef, useState } from 'react'
import SignIn, { type SignedInAccount } from './pages/SignIn'
import SignUp from './pages/SignUp'
import CreatePassword from './pages/CreatePassword'
import AuthLayout from './components/AuthLayout'
import ForgotPassword from './pages/ForgotPassword'
import VerifyEmail from './pages/VerifyEmail'
import Home from './pages/Home'
import Events from './pages/Events'
import Navbar from './components/Navbar'
import Clubs from './pages/Clubs'
import Dashboard from './pages/Dashboard'
import ClubPage from './pages/ClubPage'
import Footer from './components/Footer'
import DeanshipApp from './deanship/DeanshipApp'

type Page = 'home' | 'clubs' | 'club' | 'events' | 'dashboard' | 'admin' | 'signin' | 'signup' | 'forgot' | 'verify' | 'password'

type Session = {
  account: SignedInAccount
  accessToken: string
  expiresAt: number
}
type RefreshResponse = {
  accessToken: string
  expiresIn: number
}

let refreshPromise: Promise<RefreshResponse> | null = null

function refreshAccessToken(): Promise<RefreshResponse> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch('/api/auth/refresh-token', {
        method: 'POST',
        credentials: 'same-origin',
      })

      if (!response.ok) {
        throw new Error('Session expired')
      }

      const result: RefreshResponse = await response.json()

      if (
        !result.accessToken ||
        !Number.isFinite(result.expiresIn) ||
        result.expiresIn <= 0
      ) {
        throw new Error('Invalid refresh response')
      }

      return result
    })().finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}
function App() {
  const [registrationUniversityId, setRegistrationUniversityId] = useState('')
  const [registrationToken, setRegistrationToken] = useState('')
  const [page, setPage] = useState<Page>('home')
  const [session, setSession] = useState<Session | null>(null)
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)

const sessionVersionRef = useRef(0)

useEffect(() => {
  let cancelled = false
  const version = sessionVersionRef.current

  async function restoreSession() {
    try {
      const result = await refreshAccessToken()

      const meResponse = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${result.accessToken}`,
        },
      })

      if (!meResponse.ok) {
        throw new Error('Unable to verify session')
      }

      const account: SignedInAccount = await meResponse.json()

      if (
        !cancelled &&
        version === sessionVersionRef.current &&
        account.status === 'ACTIVE'
      ) {
        setSession({
          account,
          accessToken: result.accessToken,
          expiresAt: Date.now() + result.expiresIn * 1000,
        })

        if (account.role === 'DEANSHIP') {
          setPage('admin')
        }
      }
    } catch {
      // No valid session exists.
    }
  }

  void restoreSession()

  return () => {
    cancelled = true
  }
}, [])

useEffect(() => {
  if (!session) return

  let cancelled = false

  const remainingMs = Math.max(
    0,
    session.expiresAt - Date.now() - 60_000,
  )

  const timeout = window.setTimeout(async () => {
    const version = sessionVersionRef.current

    try {
      const result = await refreshAccessToken()

      if (cancelled || version !== sessionVersionRef.current) {
        return
      }

      setSession((current) =>
        current
          ? {
              ...current,
              accessToken: result.accessToken,
              expiresAt: Date.now() + result.expiresIn * 1000,
            }
          : null,
      )
    } catch {
      if (!cancelled && version === sessionVersionRef.current) {
        setSession(null)
        setPage('home')
      }
    }
  }, remainingMs)

  return () => {
    cancelled = true
    window.clearTimeout(timeout)
  }
}, [session])

  function handleSignedIn(
  account: SignedInAccount,
  accessToken: string,
  expiresIn: number,
) {
  sessionVersionRef.current += 1

  setSession({
    account,
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  })

  setPage(account.role === 'DEANSHIP' ? 'admin' : 'home')
}

async function handleSignOut() {
  sessionVersionRef.current += 1

  setSession(null)
  setPage('home')

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    })
  } catch {
    // Local session has already been cleared.
  }
}

  function openClub(clubId: string) {
  setSelectedClubId(clubId)
  setPage('club')
  window.scrollTo(0, 0)
}
if (page === 'admin') {
  if (!session || session.account.role !== 'DEANSHIP') {
    return null
  }

  return (
    <DeanshipApp
      onStudentSite={() => setPage('home')}
      onSignOut={handleSignOut}
    />
  )
}
  const isSignUp = page === 'signup' || page === 'verify' || page === 'password'

  if (
  page === 'home' ||
  page === 'clubs' ||
  page === 'club' ||
  page === 'events' ||
  page === 'dashboard'
) {
    return (
      <div className="flex min-h-screen flex-col bg-paper text-ink">
        <Navbar
          page={page === 'club' ? 'clubs' : page}
          onHome={() => setPage('home')}
          onClubs={() => setPage('clubs')}
          onEvents={() => setPage('events')}
          onSignIn={() => setPage('signin')}
          accountRole={session?.account.role}
          onDashboard={() => {
            if (session?.account.role === 'DEANSHIP') {
              setPage('admin')
            } else if (session?.account.role === 'STUDENT') {
              setPage('dashboard')
            } else {
              setPage('signin')
            }
          }}
          signedInEmail={session?.account.email}
          onSignOut={handleSignOut}
        />
                <main className="flex-1">
        {page === 'home' ? (
          <Home
            onSignIn={() => setPage('signin')}
            onEvents={() => setPage('events')}
            onClubClick={openClub}
            isSignedIn={Boolean(session)}
          />
        ) : page === 'clubs' ? (
          <Clubs onClubClick={openClub} />
        ) : page === 'club' && selectedClubId ? (
          <ClubPage
            clubId={selectedClubId}
            onBack={() => {
              setPage('clubs')
              window.scrollTo(0, 0)
            }}
          />
        ) : page === 'events' ? (
          <Events 
          isSignedIn={Boolean(session)} 
          onSignIn={() => setPage('signin')}
          />
               ) : session?.account.role === 'STUDENT' ? (
                <Dashboard
                  account={session.account}
                  onClubs={() => setPage('clubs')}
                />
              ) : null}
        </main>

        <Footer />
      </div>
    )
  }

  let content
  if (page === 'signup') {
    content = (
      <SignUp
        onSignIn={() => setPage('signin')}
        onHome={() => setPage('home')}
        onContinue={(universityId) => {
          setRegistrationUniversityId(universityId)
          setRegistrationToken('')
          setPage('verify')
        }}
      />
    )
  } else if (page === 'forgot') {
    content = <ForgotPassword onSignIn={() => setPage('signin')} onHome={() => setPage('home')} />
  } else if (page === 'verify') {
    content = (
      <VerifyEmail
        universityId={registrationUniversityId}
        onBack={() => setPage('signup')}
        onVerified={(token) => {
          setRegistrationToken(token)
          setPage('password')
        }}
        onHome={() => setPage('home')}
      />
    )
  } else if (page === 'password') {
    content = (
      <CreatePassword
        universityId={registrationUniversityId}
        registrationToken={registrationToken}
        onHome={() => setPage('home')}
        onSignIn={() => {
          setRegistrationUniversityId('')
          setRegistrationToken('')
          setPage('signin')
        }}
      />
    )
  } else {
    content = (
      <SignIn
        onSignUp={() => { setRegistrationUniversityId(''); setRegistrationToken(''); setPage('signup') }}
        onForgotPassword={() => setPage('forgot')}
        onHome={() => setPage('home')}
        onSignedIn={handleSignedIn}
      />
    )
  }

  return <AuthLayout isSignUp={isSignUp} pageKey={page}>{content}</AuthLayout>
}

export default App
