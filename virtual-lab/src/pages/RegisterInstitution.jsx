import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function RegisterInstitution() {
  const navigate = useNavigate()
  const { setAuthSession } = useAuth()

  // Institution details
  const [name, setName] = useState('')
  const [schoolCode, setSchoolCode] = useState('')
  const [location, setLocation] = useState('')
  const [website, setWebsite] = useState('')

  // Initial Faculty & Department
  const [facultyName, setFacultyName] = useState('Faculty of Computing')
  const [facultyCode, setFacultyCode] = useState('CP')
  const [departmentName, setDepartmentName] = useState('Computer Science')
  const [departmentCode, setDepartmentCode] = useState('CSC')

  // Administrator Account
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [password, setPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !schoolCode.trim() || !adminName.trim() || !adminEmail.trim() || !password) {
      setSubmitError('Please fill in all mandatory fields.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await auth.registerInstitution({
        name: name.trim(),
        school_code: schoolCode.trim().toUpperCase(),
        location: location.trim() || null,
        website: website.trim() || null,
        faculty_name: facultyName.trim() || 'Faculty of Computing',
        faculty_code: (facultyCode.trim() || 'CP').toUpperCase(),
        department_name: departmentName.trim() || 'Computer Science',
        department_code: (departmentCode.trim() || 'CSC').toUpperCase(),
        admin_name: adminName.trim(),
        admin_email: adminEmail.trim(),
        password,
      })

      if (res?.user && res?.profile) {
        setAuthSession(res.user, res.profile)
        navigate('/admin', { replace: true })
      } else {
        navigate('/login', {
          replace: true,
          state: { notice: 'Institution created. Check your email to confirm your address, then sign in as its administrator.' },
        })
      }
    } catch (err) {
      setSubmitError(err.message || 'Institution registration failed')
      setSubmitting(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="page" style={{ width: '100%', maxWidth: 640 }}>
        <div style={{ marginBottom: 16 }}>
          <Link to="/" className="back-link">
            ← Back to Home
          </Link>
        </div>

        <div className="card">
          <h2 style={{ margin: '0 0 12px' }}>Register New Institution</h2>

          <p className="small muted" style={{ marginTop: 0, marginBottom: 20 }}>
            Onboard your university onto KARRAS Virtual Lab with a custom School Code and an administrative control portal.
          </p>

          {submitError && <div className="error" style={{ marginBottom: 18 }}>{submitError}</div>}

          <form onSubmit={handleSubmit}>
            {/* Section 1: Institution Info */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '16px',
              marginBottom: 18,
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.98rem', marginBottom: 12 }}>
                1. University / College Information
              </div>

              <div className="field">
                <label className="label" htmlFor="inst_name">Institution Full Name</label>
                <input
                  id="inst_name"
                  type="text"
                  className="input"
                  placeholder="e.g. Federal University of Lafia"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-row">
                <div className="field">
                  <label className="label" htmlFor="school_code">
                    School Code (Short Identifier)
                  </label>
                  <input
                    id="school_code"
                    type="text"
                    className="input"
                    style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                    placeholder="e.g. FULAFIA or UNILAG"
                    value={schoolCode}
                    onChange={(e) => setSchoolCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                    required
                  />
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Students and lecturers will use this code to join.
                  </div>
                </div>

                <div className="field">
                  <label className="label" htmlFor="location">City / Location</label>
                  <input
                    id="location"
                    type="text"
                    className="input"
                    placeholder="Lafia, Nasarawa State"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label" htmlFor="website">Official Website (optional)</label>
                <input
                  id="website"
                  type="url"
                  className="input"
                  placeholder="https://university.edu.ng"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
            </div>

            {/* Section 2: Initial Department & Faculty */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '16px',
              marginBottom: 18,
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.98rem', marginBottom: 6 }}>
                2. Initial Faculty & Department
              </div>
              <div className="small muted" style={{ marginBottom: 12 }}>
                You can add more departments anytime from your Admin Portal.
              </div>

              <div className="form-row">
                <div className="field" style={{ flex: 2 }}>
                  <label className="label" htmlFor="fac_name">Faculty Name</label>
                  <input
                    id="fac_name"
                    type="text"
                    className="input"
                    placeholder="Faculty of Computing"
                    value={facultyName}
                    onChange={(e) => setFacultyName(e.target.value)}
                    required
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label className="label" htmlFor="fac_code">Faculty Code</label>
                  <input
                    id="fac_code"
                    type="text"
                    className="input"
                    placeholder="CP"
                    style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}
                    value={facultyCode}
                    onChange={(e) => setFacultyCode(e.target.value.toUpperCase())}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="field" style={{ flex: 2, marginBottom: 0 }}>
                  <label className="label" htmlFor="dept_name">Department Name</label>
                  <input
                    id="dept_name"
                    type="text"
                    className="input"
                    placeholder="Computer Science"
                    value={departmentName}
                    onChange={(e) => setDepartmentName(e.target.value)}
                    required
                  />
                </div>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="label" htmlFor="dept_code">Dept Code</label>
                  <input
                    id="dept_code"
                    type="text"
                    className="input"
                    placeholder="CSC"
                    style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}
                    value={departmentCode}
                    onChange={(e) => setDepartmentCode(e.target.value.toUpperCase())}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Institutional Administrator Account */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '16px',
              marginBottom: 18,
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.98rem', marginBottom: 12 }}>
                3. Lead Administrator Account
              </div>

              <div className="field">
                <label className="label" htmlFor="admin_name">Admin Full Name / Office Title</label>
                <input
                  id="admin_name"
                  type="text"
                  className="input"
                  placeholder="e.g. FULAFIA ICT Director"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  required
                />
              </div>

              <div className="form-row">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label" htmlFor="admin_email">Admin Email</label>
                  <input
                    id="admin_email"
                    type="email"
                    className="input"
                    placeholder="admin@university.edu.ng"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label" htmlFor="admin_password">Admin Password</label>
                  <input
                    id="admin_password"
                    type="password"
                    className="input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-block"
              style={{ marginTop: 8 }}
              disabled={submitting}
            >
              {submitting ? 'Registering institution…' : 'Register Institution & Create Portal'}
            </button>
          </form>

          <div style={{ marginTop: 18, textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <span className="small muted">Already registered your school? </span>
            <Link to="/login" style={{ fontSize: '0.88rem', color: 'var(--text)', fontWeight: 600 }}>
              Sign in to Admin Portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
