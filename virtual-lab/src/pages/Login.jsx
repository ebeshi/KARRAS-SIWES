import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const PEOPLE = [
  {
    role: 'instructor',
    label: 'LECTURER',
    name: 'Dr. Chukwuemeka Chukwu',
    meta: 'Faculty of Technology · Dept. of Computer Science & Engineering',
    credentials: [
      {
        label: 'Prototype login (works immediately)',
        note: 'Already exists in Supabase Auth',
        email: 'instructor@demo.com',
        password: 'demo1234',
      },
      {
        label: 'Realistic university email',
        note: 'Create in Authentication → Users first',
        email: 'instructor.chukwu@oau.edu.ng',
        password: 'demo1234',
      },
    ],
  },
  {
    role: 'student',
    label: 'STUDENT · 200 LEVEL',
    name: 'Olaoluwa Adeyemi',
    meta: 'Matric CSC/2020/048 · Faculty of Technology · CS & Engineering',
    credentials: [
      {
        label: 'Prototype login (works immediately)',
        note: 'Already exists in Supabase Auth',
        email: 'student@demo.com',
        password: 'demo1234',
      },
      {
        label: 'Realistic university email',
        note: 'Create in Authentication → Users first',
        email: 'ola.adeyemi.200489@oau.edu.ng',
        password: 'demo1234',
      },
    ],
  },
  {
    role: 'student',
    label: 'STUDENT · 300 LEVEL',
    name: 'Precious Okafor',
    meta: 'Matric CSC/2019/012 · Faculty of Technology · CS & Engineering',
    credentials: [
      {
        label: 'Realistic university email',
        note: 'Create in Authentication → Users first',
        email: 'precious.okafor.200512@oau.edu.ng',
        password: 'demo1234',
      },
    ],
  },
]

export default function Login() {
  const { signIn, profile, loading, supabaseMissing, hasClient, initError } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (profile) {
      const to = profile.role === 'instructor' ? '/instructor' : '/student'
      navigate(to, { replace: true })
    }
  }, [profile, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!hasClient) {
      setError('Configure Supabase first — see banner above.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(err.message || 'Sign in failed')
      setSubmitting(false)
    }
  }

  const fill = (e, p) => {
    setEmail(e)
    setPassword(p)
    setTimeout(() => document.getElementById('password')?.focus(), 0)
  }

  const showSpinner = submitting || loading

  return (
    <div className="login-wrap">
      <div className="page" style={{ width: '100%', maxWidth: 520 }}>
        <div className="brand">
          <div className="brand-mark">
            <img src="/k-logo.svg" alt="KARRAS" width="46" height="46" style={{ display: 'block' }} />
          </div>
          <h2>KARRAS</h2>
          <h1>Virtual Lab</h1>
          <p>Coding assignments, submissions, grading.</p>
        </div>
        <div className="card">
          <h2>Sign in</h2>
          {supabaseMissing && (
            <div className="error">
              Supabase not configured yet. Add your project env vars to <code>.env</code> and restart the dev server before you can sign in.
              {initError && <div style={{ marginTop: 6, fontSize: '0.85rem' }}>{initError}</div>}
            </div>
          )}
          {error && <div className="error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="input"
                autoComplete="email"
                autoCapitalize="none"
                required
                disabled={!hasClient}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.ng"
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
                disabled={!hasClient}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className="btn btn-block" disabled={showSpinner || !hasClient}>
              {!hasClient ? 'Waiting for Supabase…' : showSpinner ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div style={{ marginTop: 18, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem' }}>Prototype demo accounts</div>
              <div className="small muted" style={{ marginTop: 4 }}>
                Realistic Nigerian university profile data. The top option in each group uses the existing <code>*@demo.com</code> users so it logs in immediately. The OAU-branded emails below each one need a matching account created in <strong>Authentication → Users → Add user</strong> with the same password.
              </div>
            </div>

            <div>
              {PEOPLE.map((p) => (
                <div key={p.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ padding: '10px 14px 6px' }}>
                    <div className="small muted" style={{ fontSize: 10.5, letterSpacing: '0.06em' }}>{p.label}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.98rem' }}>{p.name}</div>
                    <div className="small muted">{p.meta}</div>
                  </div>
                  <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {p.credentials.map((c) => (
                      <div
                        key={c.email}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: 14,
                          background: 'rgba(255,255,255,0.01)',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="small muted" style={{ fontSize: 11 }}>{c.label}</div>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, marginTop: 3 }}>
                            {c.email} <span className="muted">/ demo1234</span>
                          </div>
                          <div className="small muted" style={{ fontSize: 11, marginTop: 3 }}>{c.note}</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => fill(c.email, c.password)}
                          style={{ padding: '6px 12px', borderRadius: 999 }}
                        >
                          Use
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
