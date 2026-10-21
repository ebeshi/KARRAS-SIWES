import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { institutions, auth } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function RegisterStudent() {
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
  const [admissionYear, setAdmissionYear] = useState('2023')
  const [serialNo, setSerialNo] = useState('0016')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [level, setLevel] = useState('200')
  const [password, setPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // Lookup institution by school code
  const handleLookupSchool = async (codeToUse) => {
    const code = (codeToUse || schoolCode).trim().toUpperCase()
    if (!code) return
    setLookupLoading(true)
    setLookupError(null)
    try {
      const res = await institutions.lookup(code)
      setInstitutionData(res)

      // Auto-select first faculty & department
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

  // Initial lookup for default FULAFIA code
  useEffect(() => {
    handleLookupSchool('FULAFIA')
  }, [])

  // When faculty changes, update department options
  const currentFaculty = institutionData?.faculties?.find(f => f.id === facultyId)
  const availableDepartments = currentFaculty?.departments || []

  // Calculate live matric number preview
  const currentDept = availableDepartments.find(d => d.id === departmentId)
  const previewMatric = (currentFaculty && currentDept && admissionYear && serialNo)
    ? `${admissionYear.trim()}/${currentFaculty.code}/${currentDept.code}/${serialNo.trim().padStart(4, '0')}`
    : '____/__/__/____'

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
      setSubmitError('Please validate a valid School Code first.')
      return
    }
    if (!departmentId) {
      setSubmitError('Please select a Department.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await auth.registerStudent({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        school_code: institutionData.institution.school_code,
        faculty_id: facultyId,
        department_id: departmentId,
        admission_year: parseInt(admissionYear, 10),
        serial_no: serialNo.trim(),
        level: parseInt(level, 10),
        phone: phone.trim() || null,
      })

      if (res?.user && res?.profile) {
        setAuthSession(res.user, res.profile)
        navigate('/student', { replace: true })
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
      <div className="page" style={{ width: '100%', maxWidth: 580 }}>
        <div style={{ marginBottom: 16 }}>
          <Link to="/" className="back-link">
            ← Back to Home
          </Link>
        </div>

        <div className="card">
          <h2 style={{ margin: '0 0 12px' }}>Student Registration</h2>

          <p className="small muted" style={{ marginTop: 0, marginBottom: 18 }}>
            Create your student lab account using your university&apos;s School Code.
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
                <span className="small muted" style={{ marginLeft: 6 }}>(e.g. FULAFIA for Federal Univ. of Lafia)</span>
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
                  style={{ flexShrink: 0 }}
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
                  flexWrap: 'wrap',
                }}>
                  <span style={{ color: 'var(--success)' }}>✓</span>
                  <div>
                    <strong style={{ color: 'var(--text)' }}>{institutionData.institution.name}</strong>
                    <span className="muted" style={{ marginLeft: 6 }}>({institutionData.institution.school_code})</span>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Academic Faculty & Department */}
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

                {/* Step 3: Matriculation Number Builder */}
                <div style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '14px',
                  marginBottom: 18,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    <label className="label" style={{ margin: 0 }}>
                      Matriculation Number Details
                    </label>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      color: 'var(--success)',
                      background: 'rgba(52, 211, 153, 0.1)',
                      border: '1px solid rgba(52, 211, 153, 0.3)',
                      padding: '4px 10px',
                      borderRadius: 6,
                      wordBreak: 'break-all',
                    }}>
                      Matric: {previewMatric}
                    </div>
                  </div>

                  <div className="matric-builder-grid">
                    <div className="field">
                      <label className="label" htmlFor="admission_year">Admission Year</label>
                      <input
                        id="admission_year"
                        type="number"
                        className="input"
                        placeholder="2023"
                        min="2010"
                        max="2035"
                        value={admissionYear}
                        onChange={(e) => setAdmissionYear(e.target.value)}
                        required
                      />
                    </div>

                    <div className="field">
                      <label className="label" htmlFor="serial_no">Admission Serial (4 digits)</label>
                      <input
                        id="serial_no"
                        type="text"
                        className="input"
                        placeholder="0016"
                        maxLength="6"
                        value={serialNo}
                        onChange={(e) => setSerialNo(e.target.value)}
                        required
                      />
                    </div>

                    <div className="field">
                      <label className="label" htmlFor="level">Level</label>
                      <select
                        id="level"
                        className="input"
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                      >
                        <option value="100">100 Level</option>
                        <option value="200">200 Level</option>
                        <option value="300">300 Level</option>
                        <option value="400">400 Level</option>
                        <option value="500">500 Level</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Step 4: Personal Info */}
                <div className="field">
                  <label className="label" htmlFor="full_name">Full Name</label>
                  <input
                    id="full_name"
                    type="text"
                    className="input"
                    placeholder="e.g. Ibrahim Musa"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="field">
                    <label className="label" htmlFor="email">Email address</label>
                    <input
                      id="email"
                      type="email"
                      className="input"
                      placeholder="ibrahim.musa@fulafia.edu.ng"
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
                      placeholder="+234 813 555 0192"
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
                  className="btn btn-block"
                  style={{ marginTop: 10 }}
                  disabled={submitting}
                >
                  {submitting ? 'Creating account…' : 'Complete Student Registration'}
                </button>
              </>
            )}
          </form>

          <div style={{ marginTop: 18, textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <span className="small muted">Already have an account? </span>
            <Link to="/login" style={{ fontSize: '0.88rem', color: 'var(--text)', fontWeight: 600 }}>
              Sign in here
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
