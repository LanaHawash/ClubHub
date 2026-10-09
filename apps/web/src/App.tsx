import { useState } from 'react'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import CreatePassword from './pages/CreatePassword'
import AuthLayout from './components/AuthLayout'
import ForgotPassword from './pages/ForgotPassword'
import VerifyEmail from './pages/VerifyEmail'
import Home from './pages/Home'

type Page = 'home' | 'signin' | 'signup' | 'forgot' | 'verify' | 'password'

function App() {
  const [registrationEmail, setRegistrationEmail] = useState('')
  const [page, setPage] = useState<Page>('home')

  const isSignUp =
    page === 'signup' || page === 'verify' || page === 'password'

    if (page === 'home') {
      return <Home onSignIn={() => setPage('signin')} />
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