import { useState } from 'react'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import CreatePassword from './pages/CreatePassword'
import AuthLayout from './components/AuthLayout'
import ForgotPassword from './pages/ForgotPassword'
import VerifyEmail from './pages/VerifyEmail'

type Page = 'signin' | 'signup' | 'forgot' | 'verify' | 'password'

function App() {
  const [registrationEmail, setRegistrationEmail] = useState('')
  const [page, setPage] = useState<Page>('signin')

  const isSignUp =
    page === 'signup' || page === 'verify' || page === 'password'

  let content

  if (page === 'signup') {
    content = (
      <SignUp
        onSignIn={() => setPage('signin')}
        onContinue={(email) => {
          setRegistrationEmail(email)
          setPage('verify')
        }}
      />
    )
  } else if (page === 'forgot') {
    content = <ForgotPassword onSignIn={() => setPage('signin')} />
  } else if (page === 'verify') {
    content = (
      <VerifyEmail
        email={registrationEmail}
        onBack={() => setPage('signup')}
        onVerified={() => setPage('password')}
      />
    )
  } else if (page === 'password') {
    content = (
      <CreatePassword
        email={registrationEmail}
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