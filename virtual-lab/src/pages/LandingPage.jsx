import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function LandingPage() {
  const { profile, signOut } = useAuth()
  const [signOutError, setSignOutError] = useState(null)

  const handleSignOut = async () => {
    setSignOutError(null)
    try {
      await signOut()
    } catch (error) {
      setSignOutError(error.message || 'Could not sign out of the current account.')
    }
  }

  const dashboardPath = profile
    ? profile.role === 'admin'
      ? '/admin'
      : profile.role === 'instructor'
      ? '/instructor'
      : '/student'
    : null

  return (
    <div className="landing-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        background: 'rgba(3, 3, 3, 0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 50,
      }}>
        <div className="landing-header-inner">
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
            <img src="/k-logo.svg" alt="KARRAS" width="32" height="32" style={{ display: 'block', flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(0.95rem, 3.5vw, 1.15rem)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                KARRAS <span style={{ color: 'var(--muted)' }}>Virtual Lab</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Computer Science Lab Platform
              </div>
            </div>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {profile ? (
              <>
                <Link to={dashboardPath} className="btn btn-sm">
                  Dashboard ({profile.role}) →
                </Link>
                <Link to="/login" className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--border)' }}>
                  Switch account
                </Link>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleSignOut}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--border)' }}>
                  Sign in
                </Link>
                <Link to="/register/student" className="btn btn-sm">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
        {signOutError && <p className="error" role="alert">{signOutError}</p>}
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderRadius: 999,
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid var(--border)',
          fontSize: '0.85rem',
          color: 'var(--muted)',
          marginBottom: 20,
          maxWidth: '100%',
          flexWrap: 'wrap',
          justifyContent: 'center',
          textAlign: 'center',
        }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#34d399', flexShrink: 0 }}></span>
          <span>Multi-Tenant University System · Active on <strong>Federal University of Lafia (FULAFIA)</strong></span>
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 5.5vw, 3.6rem)',
          fontWeight: 700,
          letterSpacing: '-0.03em',
          lineHeight: 1.12,
          margin: '0 0 18px',
        }}>
          The Intelligent Virtual Lab for <br />
          <span style={{
            background: 'linear-gradient(135deg, #ffffff 40%, #a1a1aa 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Practical Computer Science
          </span>
        </h1>

        <p style={{
          maxWidth: 680,
          margin: '0 auto 32px',
          color: 'var(--muted)',
          fontSize: 'clamp(0.95rem, 2.5vw, 1.12rem)',
          lineHeight: 1.6,
        }}>
          Execute Python and JavaScript directly inside the browser with zero setup.
          Integrated PDF lab manuals, automated grading testcases, and unified institutional management.
        </p>

        {/* Action CTAs */}
        <div className="landing-actions">
          <Link to="/register/student" className="btn" style={{ padding: '12px 24px', fontSize: '0.98rem', borderRadius: 999 }}>
            🎓 Register as Student
          </Link>
          <Link to="/register/instructor" className="btn btn-secondary" style={{ padding: '12px 22px', fontSize: '0.98rem', borderRadius: 999 }}>
            👨‍🏫 Register as Lecturer
          </Link>
          <Link to="/register/institution" className="btn btn-ghost" style={{ padding: '12px 20px', fontSize: '0.98rem', border: '1px solid var(--border)', borderRadius: 999 }}>
            🏛️ Register Institution
          </Link>
        </div>

        {/* Quick Demo Pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          padding: '8px 16px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.86rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: '100%',
        }}>
          <span className="muted">Sample Matriculation Format:</span>
          <code style={{ fontFamily: 'var(--font-mono)', color: '#34d399', fontWeight: 600 }}>
            2023 / CP / CSC / 0016
          </code>
          <span className="muted small">(Year · Faculty · Dept · Serial)</span>
        </div>
      </section>

      {/* Role Portals Grid */}
      <section style={{ maxWidth: 1100, margin: '10px auto 50px', padding: '0 16px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem, 4vw, 1.8rem)', margin: '0 0 8px' }}>
            Designed for Every Academic Stakeholder
          </h2>
          <p className="small muted">Seamless synergy between students, instructors, and departmental leadership.</p>
        </div>

        <div className="landing-roles-grid">
          {/* Card 1: Students */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>🎓</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginTop: 0, marginBottom: 8 }}>
                Students
              </h3>
              <p className="small muted" style={{ lineHeight: 1.6, marginBottom: 16 }}>
                Register using your school code and departmental matric number. Browse published lab packs, code inside CodeMirror with WebAssembly Pyodide execution, and get immediate testcase feedback.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.8, margin: '0 0 20px' }}>
                <li>Auto-formatted matric number generation</li>
                <li>Side-by-side PDF manual & instruction reader</li>
                <li>Instant run output and auto-pass criteria</li>
              </ul>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
              <Link to="/register/student" className="btn btn-sm btn-block">
                Register as Student
              </Link>
              <Link to="/login" className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--border)' }}>
                Login
              </Link>
            </div>
          </div>

          {/* Card 2: Lecturers */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>👨‍🏫</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginTop: 0, marginBottom: 8 }}>
                Lecturers & Instructors
              </h3>
              <p className="small muted" style={{ lineHeight: 1.6, marginBottom: 16 }}>
                Curate semester lab manuals with sequential tasks, starter code, and expected outputs. Bulk-import exercises from JSON or PDFs and grade student submissions with automated scoring.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.8, margin: '0 0 20px' }}>
                <li>Bulk JSON manual creation with drag-and-drop</li>
                <li>Live student submission progress grid</li>
                <li>One-click CSV gradebook export for records</li>
              </ul>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
              <Link to="/register/instructor" className="btn btn-secondary btn-sm btn-block">
                Register as Lecturer
              </Link>
              <Link to="/login" className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--border)' }}>
                Login
              </Link>
            </div>
          </div>

          {/* Card 3: Institution Admins */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>🏛️</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginTop: 0, marginBottom: 8 }}>
                Institutions & Faculty Admins
              </h3>
              <p className="small muted" style={{ lineHeight: 1.6, marginBottom: 16 }}>
                Register your university with a unique School Code (e.g., FULAFIA). Setup faculties and departments, manage student rosters, and monitor lab execution analytics.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.8, margin: '0 0 20px' }}>
                <li>Multi-tenant school code isolation</li>
                <li>Faculty & Department code hierarchy (`CP`, `CSC`)</li>
                <li>Real-time roster analytics & enrollment stats</li>
              </ul>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
              <Link to="/register/institution" className="btn btn-secondary btn-sm btn-block">
                Register Institution
              </Link>
              <Link to="/login" className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--border)' }}>
                Admin Login
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Institution: Federal University of Lafia */}
      <section style={{ maxWidth: 1100, margin: '0 auto 50px', padding: '0 16px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 'clamp(20px, 3.5vw, 36px) clamp(16px, 3vw, 32px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
            <div>
              <span className="badge badge-submitted" style={{ marginBottom: 8, display: 'inline-block' }}>Featured Institution Setup</span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.2rem, 3.5vw, 1.5rem)', margin: '4px 0 6px' }}>
                Federal University of Lafia (FULAFIA)
              </h3>
              <div className="small muted">School Code: <strong style={{ color: 'var(--text)' }}>FULAFIA</strong> · Faculty of Computing (CP)</div>
            </div>
            <Link to="/register/student" className="btn btn-sm">
              Register with FULAFIA Code →
            </Link>
          </div>

          <div className="landing-dept-grid">
            <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.4)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Department 01</div>
              <div style={{ fontWeight: 600, fontSize: '1rem', marginTop: 4 }}>Computer Science</div>
              <div className="small muted" style={{ marginTop: 2 }}>Code: <span style={{ fontFamily: 'var(--font-mono)' }}>CSC</span> · Matric: <span style={{ fontFamily: 'var(--font-mono)', color: '#34d399' }}>2023/CP/CSC/0016</span></div>
            </div>

            <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.4)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Department 02</div>
              <div style={{ fontWeight: 600, fontSize: '1rem', marginTop: 4 }}>Information Technology</div>
              <div className="small muted" style={{ marginTop: 2 }}>Code: <span style={{ fontFamily: 'var(--font-mono)' }}>IFT</span> · Matric: <span style={{ fontFamily: 'var(--font-mono)', color: '#34d399' }}>2023/CP/IFT/0008</span></div>
            </div>

            <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.4)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Department 03</div>
              <div style={{ fontWeight: 600, fontSize: '1rem', marginTop: 4 }}>Cybersecurity</div>
              <div className="small muted" style={{ marginTop: 2 }}>Code: <span style={{ fontFamily: 'var(--font-mono)' }}>CYB</span> · Matric: <span style={{ fontFamily: 'var(--font-mono)', color: '#34d399' }}>2023/CP/CYB/0024</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        marginTop: 'auto',
        borderTop: '1px solid var(--border)',
        padding: '24px 16px',
        textAlign: 'center',
        fontSize: '0.85rem',
        color: 'var(--muted-2)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>KARRAS Virtual Lab · Offline & Online Computer Science Education</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/login" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Login</Link>
            <Link to="/register/student" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Student Sign Up</Link>
            <Link to="/register/instructor" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Instructor Sign Up</Link>
            <Link to="/register/institution" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Register School</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
