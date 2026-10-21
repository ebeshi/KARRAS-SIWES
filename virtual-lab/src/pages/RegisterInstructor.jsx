import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { institutions, auth } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function RegisterInstructor() {
  const navigate = useNavigate()
  const { setAuthSession } = useAuth()

  // School lookup state
  const [schoolCode, setSchoolCode] = useState('FULAFIA')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [institutionData, setInstitutionData] = useState(null)
  const [lookupError, setLookupError] = useState(null)

  // Form fields
  const [facultyId, setFacultyId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const handleLookupSchool = async (codeToUse) => {
    const code = (codeToUse || schoolCode).trim().toUpperCase()
    if (!code) return
    setLookupLoading(true)
    setLookupError(null)
    try {
      const res = await institutions.lookup(code)
      setInstitutionData(res)

      if (res.faculties && res.faculties.length > 0) {
        const firstFac = res.faculties[0]
        setFacultyId(firstFac.id)
        if (firstFac.departments && firstFac.departments.length > 0) {
          setDepartmentId(firstFac.departments[0].id)
        }
      }
    } catch (err) {
      setInstitutionData(null)
      setFacultyId('')
      setDepartmentId('')
      setLookupError(err.message || 'Invalid school code')
    } finally {
      setLookupLoading(false)
    }
  }

  useEffect(() => {
    handleLookupSchool('FULAFIA')
  }, [])

  const currentFaculty = institutionData?.faculties?.find(f => f.id === facultyId)
  const availableDepartments = currentFaculty?.departments || []

  const handleFacultyChange = (newFacId) => {
    setFacultyId(newFacId)
    const fac = institutionData?.faculties?.find(f => f.id === newFacId)
    if (fac?.departments && fac.departments.length > 0) {
      setDepartmentId(fac.departments[0].id)
    } else {
      setDepartmentId('')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!institutionData) {
      setSubmitError('Please enter and verify a valid School Code.')
      return
    }
    if (!departmentId) {
      setSubmitError('Please select your academic department.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await auth.registerInstructor({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        school_code: institutionData.institution.school_code,
        department_id: departmentId,
        phone: phone.trim() || null,
      })

      if (res?.user && res?.profile) {
        setAuthSession(res.user, res.profile)
        navigate('/instructor', { replace: true })
      } else {
        navigate('/login', {
          replace: true,
          state: { notice: 'Account created. Check your email to confirm your address, then sign in.' },
        })
      }
    } catch (err) {
      setSubmitError(err.message || 'Registration failed')
      setSubmitting(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="page" style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ marginBottom: 16 }}>
          <Link to="/" className="back-link">
            ← Back to Home
          </Link>
        </div>

        <div className="card">
          <h2 style={{ margin: '0 0 12px' }}>Lecturer Registration</h2>

          <p className="small muted" style={{ marginTop: 0, marginBottom: 18 }}>
            Create an instructor workspace to manage lab packs, assignments, and student grades.
          </p>

          {submitError && <div className="error" style={{ marginBottom: 16 }}>{submitError}</div>}

          <form onSubmit={handleSubmit}>
            {/* Step 1: School Code Verification */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '14px',
              marginBottom: 18,
            }}>
              <label className="label" htmlFor="school_code">
                1. School Code
                <span className="small muted" style={{ marginLeft: 6 }}>(e.g. FULAFIA)</span>
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input
                  id="school_code"
                  type="text"
                  className="input"
                  style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.05em' }}
                  value={schoolCode}
                  onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                  placeholder="FULAFIA"
                  required
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleLookupSchool(schoolCode)}
                  disabled={lookupLoading}
                >
                  {lookupLoading ? 'Checking…' : 'Verify'}
                </button>
              </div>

              {lookupError && (
                <div className="small" style={{ color: 'var(--danger)', marginTop: 8 }}>
                  ✕ {lookupError}
                </div>
              )}

              {institutionData && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 10,
                  padding: '8px 12px',
                  background: 'rgba(52, 211, 153, 0.08)',
                  border: '1px solid rgba(52, 211, 153, 0.25)',
                  borderRadius: 10,
                  fontSize: '0.88rem',
                }}>
                  <span style={{ color: 'var(--success)' }}>✓</span>
                  <div>
                    <strong style={{ color: 'var(--text)' }}>{institutionData.institution.name}</strong>
                    <span className="muted" style={{ marginLeft: 6 }}>({institutionData.institution.school_code})</span>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Faculty & Department */}
            {institutionData && (
              <>
                <div className="form-row">
                  <div className="field">
                    <label className="label" htmlFor="faculty">Faculty</label>
                    <select
                      id="faculty"
                      className="input"
                      value={facultyId}
                      onChange={(e) => handleFacultyChange(e.target.value)}
                      required
                    >
                      {institutionData.faculties?.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="department">Department</label>
                    <select
                      id="department"
                      className="input"
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                      required
                    >
                      {availableDepartments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label className="label" htmlFor="full_name">Full Name & Title</label>
                  <input
                    id="full_name"
                    type="text"
                    className="input"
                    placeholder="e.g. Dr. John Doe or Prof. Amina Bello"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="field">
                    <label className="label" htmlFor="email">Official / University Email</label>
                    <input
                      id="email"
                      type="email"
                      className="input"
                      placeholder="lecturer@fulafia.edu.ng"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="phone">Phone Number (optional)</label>
                    <input
                      id="phone"
                      type="tel"
                      className="input"
                      placeholder="+234 803 000 0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label className="label" htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    className="input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-secondary btn-block"
                  style={{ marginTop: 10 }}
                  disabled={submitting}
                >
                  {submitting ? 'Creating instructor account…' : 'Complete Lecturer Registration'}
                </button>
              </>
            )}
          </form>

          <div style={{ marginTop: 18, textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <span className="small muted">Already have an instructor account? </span>
            <Link to="/login" style={{ fontSize: '0.88rem', color: 'var(--text)', fontWeight: 600 }}>
              Sign in here
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
