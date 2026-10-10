import { useState } from 'react'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import CreatePassword from './pages/CreatePassword'
import AuthLayout from './components/AuthLayout'
import ForgotPassword from './pages/ForgotPassword'
import VerifyEmail from './pages/VerifyEmail'
import Home from './pages/Home'
import Events from './pages/Events'
import Navbar from './components/Navbar'
import Clubs from './pages/Clubs'

type Page = 'home' | 'clubs' | 'events' | 'signin' | 'signup' | 'forgot' | 'verify' | 'password'
function App() {
  const [registrationEmail, setRegistrationEmail] = useState('')
  const [page, setPage] = useState<Page>('home')

  const isSignUp =
    page === 'signup' || page === 'verify' || page === 'password'

    if (page === 'home' || page === 'clubs' || page === 'events') {
        return (
          <div className="min-h-screen bg-paper text-ink">
            <Navbar
              page={page}
              onHome={() => setPage('home')}
              onClubs={() => setPage('clubs')}
              onEvents={() => setPage('events')}
              onSignIn={() => setPage('signin')}
            />

            {page === 'home' ? (
              <Home
                onSignIn={() => setPage('signin')}
                onEvents={() => setPage('events')}
              />
            ) : page === 'clubs' ? (
              <Clubs />
            ) : (
              <Events />
            )}
          </div>
        )
      }

  let content

  if (page === 'signup') {
    content = (
      <SignUp
        onSignIn={() => setPage('signin')}
        onHome={() => setPage('home')}
        onContinue={(email) => {
          setRegistrationEmail(email)
          setPage('verify')
        }}
      />
    )
  } else if (page === 'forgot') {
    content = <ForgotPassword onSignIn={() => setPage('signin')} onHome={() => setPage('home')} />
  } else if (page === 'verify') {
    content = (
      <VerifyEmail
        email={registrationEmail}
        onBack={() => setPage('signup')}
        onVerified={() => setPage('password')}
        onHome={() => setPage('home')}
      />
    )
  } else if (page === 'password') {
    content = (
      <CreatePassword
        email={registrationEmail}
        onHome={() => setPage('home')}
        onSignIn={() => {
          setRegistrationEmail('')
          setPage('signin')
        }}
      />
    )
  } else {
    content = (
      <SignIn
        onSignUp={() => setPage('signup')}
        onForgotPassword={() => setPage('forgot')}
        onHome={() => setPage('home')}
      />
    )
  }

  return (
    <AuthLayout isSignUp={isSignUp} pageKey={page}>
      {content}
    </AuthLayout>
  )
}

export default App