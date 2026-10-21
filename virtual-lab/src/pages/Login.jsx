import { useEffect, useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { signIn, profile, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (profile) {
      const to = profile.role === 'admin' ? '/admin' : profile.role === 'instructor' ? '/instructor' : '/student'
      navigate(to, { replace: true })
    }
  }, [profile, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(err.message || 'Sign in failed')
      setSubmitting(false)
    }
  }

  const showSpinner = submitting || loading

  return (
    <div className="login-wrap">
      <div className="page" style={{ width: '100%', maxWidth: 540 }}>
        <div style={{ marginBottom: 16 }}>
          <Link to="/" className="back-link">
            ← Back to Home
          </Link>
        </div>

        <div className="brand">
          <div className="brand-mark">
            <img src="/k-logo.svg" alt="KARRAS" width="46" height="46" style={{ display: 'block' }} />
          </div>
          <h2>KARRAS</h2>
          <h1>Virtual Lab</h1>
          <p>Interactive coding assignments, real-time testing, & academic administration.</p>
        </div>

        <div className="card">
          <h2>Sign in</h2>
          {location.state?.notice && <div className="success">{location.state.notice}</div>}
          {error && <div className="error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="input"
                autoComplete="email"
                autoCapitalize="none"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="input"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className="btn btn-block" disabled={showSpinner}>
              {showSpinner ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Quick Registration Links */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
            <div className="small muted" style={{ marginBottom: 10 }}>New to Virtual Lab? Create an account:</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/register/student" className="btn btn-secondary btn-sm">
                🎓 Student
              </Link>
              <Link to="/register/instructor" className="btn btn-secondary btn-sm">
                👨‍🏫 Lecturer
              </Link>
              <Link to="/register/institution" className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--border)' }}>
                🏛️ School Admin
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
