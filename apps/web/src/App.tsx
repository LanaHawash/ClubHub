import { useEffect, useState } from 'react'
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

type Page = 'home' | 'clubs' | 'events' | 'dashboard' | 'signin' | 'signup' | 'forgot' | 'verify' | 'password'

type Session = {
  account: SignedInAccount
  accessToken: string
  expiresAt: number
}

function App() {
  const [registrationUniversityId, setRegistrationUniversityId] = useState('')
  const [registrationToken, setRegistrationToken] = useState('')
  const [page, setPage] = useState<Page>('home')
  const [session, setSession] = useState<Session | null>(null)

  // The JWT is held in React memory only. Refreshing the page signs out.
  useEffect(() => {
    if (!session) return
    const remainingMs = Math.max(0, session.expiresAt - Date.now())
    const timeout = window.setTimeout(() => {
      setSession(null)
      setPage((current) => current === 'dashboard' ? 'home' : current)
    }, remainingMs)
    return () => window.clearTimeout(timeout)
  }, [session])

  function handleSignedIn(account: SignedInAccount, accessToken: string, expiresIn: number) {
    setSession({ account, accessToken, expiresAt: Date.now() + expiresIn * 1000 })
    setPage('home')
  }

  function handleSignOut() {
    setSession(null)
    setPage('home')
  }

  const isSignUp = page === 'signup' || page === 'verify' || page === 'password'

  if (page === 'home' || page === 'clubs' || page === 'events' || page === 'dashboard') {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <Navbar
          page={page}
          onHome={() => setPage('home')}
          onClubs={() => setPage('clubs')}
          onEvents={() => setPage('events')}
          onSignIn={() => setPage('signin')}
          onDashboard={() => setPage(session ? 'dashboard' : 'signin')}
          signedInEmail={session?.account.email}
          onSignOut={handleSignOut}
        />
        {page === 'home' ? (
          <Home
            onSignIn={() => setPage('signin')}
            onEvents={() => setPage('events')}
            isSignedIn={Boolean(session)}
          />
        ) : page === 'clubs' ? (
          <Clubs />
        ) : page === 'events' ? (
          <Events 
          isSignedIn={Boolean(session)} 
          onSignIn={() => setPage('signin')}
          />
        ) : session ? (
          <Dashboard account={session.account} onClubs={() => setPage('clubs')} />
        ) : null}
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
