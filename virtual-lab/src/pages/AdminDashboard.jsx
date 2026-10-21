import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { admin, institutions } from '../lib/api.js'

export default function AdminDashboard() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Analytics data
  const [overviewData, setOverviewData] = useState(null)
  const [institutionStructure, setInstitutionStructure] = useState(null)

  // Roster data
  const [rosterRole, setRosterRole] = useState('student')
  const [rosterUsers, setRosterUsers] = useState([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [deptFilter, setDeptFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  // New Department Modal
  const [showAddDept, setShowAddDept] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptCode, setNewDeptCode] = useState('')
  const [newDeptFacId, setNewDeptFacId] = useState('')
  const [addDeptLoading, setAddDeptLoading] = useState(false)

  // New Faculty Modal
  const [showAddFac, setShowAddFac] = useState(false)
  const [newFacName, setNewFacName] = useState('')
  const [newFacCode, setNewFacCode] = useState('')
  const [addFacLoading, setAddFacLoading] = useState(false)

  const institutionId = profile?.institution_id

  const loadOverview = async () => {
    if (!institutionId) return
    setLoading(true)
    setError(null)
    try {
      const data = await admin.getOverview(institutionId)
      setOverviewData(data)

      // Also get structure for departments/faculties
      if (data?.institution?.school_code) {
        const struct = await institutions.lookup(data.institution.school_code)
        setInstitutionStructure(struct)
        if (struct.faculties && struct.faculties.length > 0) {
          setNewDeptFacId(struct.faculties[0].id)
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load institution overview')
    } finally {
      setLoading(false)
    }
  }

  const loadRoster = async (role = rosterRole) => {
    if (!institutionId) return
    setRosterLoading(true)
    try {
      const data = await admin.getRoster(institutionId, role, deptFilter)
      setRosterUsers(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setRosterLoading(false)
    }
  }

  useEffect(() => {
    loadOverview()
  }, [institutionId])

  useEffect(() => {
    if (tab === 'roster') {
      loadRoster(rosterRole)
    }
  }, [tab, rosterRole, deptFilter])

  const handleCreateFaculty = async (e) => {
    e.preventDefault()
    if (!newFacName.trim() || !newFacCode.trim()) return
    setAddFacLoading(true)
    try {
      await admin.addFaculty({
        institution_id: institutionId,
        name: newFacName.trim(),
        code: newFacCode.trim().toUpperCase(),
      })
      setShowAddFac(false)
      setNewFacName('')
      setNewFacCode('')
      await loadOverview()
    } catch (err) {
      alert(err.message || 'Failed to add faculty')
    } finally {
      setAddFacLoading(false)
    }
  }

  const handleCreateDepartment = async (e) => {
    e.preventDefault()
    if (!newDeptName.trim() || !newDeptCode.trim() || !newDeptFacId) return
    setAddDeptLoading(true)
    try {
      await admin.addDepartment({
        institution_id: institutionId,
        faculty_id: newDeptFacId,
        name: newDeptName.trim(),
        code: newDeptCode.trim().toUpperCase(),
      })
      setShowAddDept(false)
      setNewDeptName('')
      setNewDeptCode('')
      await loadOverview()
    } catch (err) {
      alert(err.message || 'Failed to add department')
    } finally {
      setAddDeptLoading(false)
    }
  }

  const doSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  // Filter roster by search term
  const filteredRoster = useMemo(() => {
    if (!searchTerm.trim()) return rosterUsers
    const s = searchTerm.toLowerCase().trim()
    return rosterUsers.filter(u =>
      (u.full_name && u.full_name.toLowerCase().includes(s)) ||
      (u.matric_no && u.matric_no.toLowerCase().includes(s)) ||
      (u.email && u.email.toLowerCase().includes(s)) ||
      (u.department_name && u.department_name.toLowerCase().includes(s))
    )
  }, [rosterUsers, searchTerm])

  const instName = overviewData?.institution?.name || profile?.institution_name || 'Institution Admin Portal'
  const schoolCode = overviewData?.institution?.school_code || profile?.school_code || ''

  return (
    <div>
      {/* Top Navigation */}
      <div className="topbar">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ wordBreak: 'break-word' }}>{instName}</h1>
            {schoolCode && (
              <span className="badge badge-submitted" style={{ fontFamily: 'var(--font-mono)' }}>
                Code: {schoolCode}
              </span>
            )}
          </div>
          <div className="subtitle" style={{ wordBreak: 'break-word' }}>
            Institutional Control & Analytics Portal · {profile?.full_name}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={doSignOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className="page">
        {/* Navigation Tabs */}
        <div className="tabs" role="tablist" style={{ marginBottom: 20 }}>
          <button
            role="tab"
            aria-selected={tab === 'overview'}
            className={'tab' + (tab === 'overview' ? ' tab-active' : '')}
            onClick={() => setTab('overview')}
          >
            📊 Analytics & Overview
          </button>
          <button
            role="tab"
            aria-selected={tab === 'roster'}
            className={'tab' + (tab === 'roster' ? ' tab-active' : '')}
            onClick={() => setTab('roster')}
          >
            👥 University Roster
          </button>
          <button
            role="tab"
            aria-selected={tab === 'structure'}
            className={'tab' + (tab === 'structure' ? ' tab-active' : '')}
            onClick={() => setTab('structure')}
          >
            🏛️ Faculties & Departments
          </button>
        </div>

        {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

        {loading ? (
          <div className="card text-center muted" style={{ padding: 40 }}>
            Loading institutional analytics…
          </div>
        ) : (
          <>
            {/* TAB 1: OVERVIEW & ANALYTICS */}
            {tab === 'overview' && (
              <div>
                {/* Stats Cards Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
                  gap: 12,
                  marginBottom: 20,
                }}>
                  <div className="card" style={{ padding: '16px' }}>
                    <div className="small muted">Total Students</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 4 }}>
                      {overviewData?.counts?.student_count || 0}
                    </div>
                  </div>

                  <div className="card" style={{ padding: '16px' }}>
                    <div className="small muted">Total Lecturers</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 4 }}>
                      {overviewData?.counts?.instructor_count || 0}
                    </div>
                  </div>

                  <div className="card" style={{ padding: '16px' }}>
                    <div className="small muted">Faculties</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 4 }}>
                      {overviewData?.counts?.faculty_count || 0}
                    </div>
                  </div>

                  <div className="card" style={{ padding: '16px' }}>
                    <div className="small muted">Departments</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 4 }}>
                      {overviewData?.counts?.department_count || 0}
                    </div>
                  </div>

                  <div className="card" style={{ padding: '16px' }}>
                    <div className="small muted">Lab Manuals</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 4 }}>
                      {overviewData?.counts?.manual_count || 0}
                    </div>
                  </div>

                  <div className="card" style={{ padding: '16px' }}>
                    <div className="small muted">Lab Submissions</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 4 }}>
                      {overviewData?.counts?.submission_count || 0}
                    </div>
                  </div>
                </div>

                {/* Departmental Student Breakdown */}
                <div className="card" style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
                      Departmental Enrollment Distribution
                    </h3>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowAddDept(true)}>
                      + Add Department
                    </button>
                  </div>

                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Department</th>
                          <th>Dept Code</th>
                          <th>Faculty</th>
                          <th>Students Enrolled</th>
                          <th>Lecturers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overviewData?.departmentStats?.length === 0 ? (
                          <tr><td colSpan="5" className="muted text-center">No departments defined yet.</td></tr>
                        ) : (
                          overviewData?.departmentStats?.map((d) => (
                            <tr key={d.id}>
                              <td><strong>{d.name}</strong></td>
                              <td><span className="badge badge-submitted">{d.code}</span></td>
                              <td className="small muted">{d.faculty_name}</td>
                              <td>{d.student_count}</td>
                              <td>{d.instructor_count}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recent Student Signups */}
                <div className="card">
                  <h3 style={{ margin: '0 0 14px', fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
                    Recent Student Registrations
                  </h3>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Student Name</th>
                          <th>Matriculation Number</th>
                          <th>Department</th>
                          <th>Level</th>
                          <th>Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overviewData?.recentStudents?.length === 0 ? (
                          <tr><td colSpan="5" className="muted text-center">No students registered yet.</td></tr>
                        ) : (
                          overviewData?.recentStudents?.map((s) => (
                            <tr key={s.id}>
                              <td>{s.full_name}</td>
                              <td>
                                <code style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                                  {s.matric_no || 'Pending'}
                                </code>
                              </td>
                              <td>{s.department || '—'}</td>
                              <td>{s.level ? `${s.level}L` : '—'}</td>
                              <td className="small muted">{s.email}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: ROSTER */}
            {tab === 'roster' && (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                  {/* Role Switcher */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className={'btn btn-sm ' + (rosterRole === 'student' ? '' : 'btn-ghost')}
                      onClick={() => setRosterRole('student')}
                      style={rosterRole !== 'student' ? { border: '1px solid var(--border)' } : {}}
                    >
                      🎓 Students ({overviewData?.counts?.student_count || 0})
                    </button>
                    <button
                      className={'btn btn-sm ' + (rosterRole === 'instructor' ? '' : 'btn-ghost')}
                      onClick={() => setRosterRole('instructor')}
                      style={rosterRole !== 'instructor' ? { border: '1px solid var(--border)' } : {}}
                    >
                      👨‍🏫 Lecturers ({overviewData?.counts?.instructor_count || 0})
                    </button>
                  </div>

                  {/* Search and Dept Filter */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: '1 1 280px', justifyContent: 'flex-end' }}>
                    <input
                      type="text"
                      className="input"
                      style={{ flex: '1 1 180px', minWidth: 140, padding: '8px 12px', fontSize: '0.88rem' }}
                      placeholder="Search name, matric, email…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <select
                      className="input"
                      style={{ flex: '1 1 140px', minWidth: 120, padding: '8px 12px', fontSize: '0.88rem' }}
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                    >
                      <option value="">All Departments</option>
                      {overviewData?.departmentStats?.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {rosterLoading ? (
                  <div className="text-center muted" style={{ padding: 30 }}>Loading roster…</div>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          {rosterRole === 'student' && <th>Matric Number</th>}
                          <th>Department</th>
                          {rosterRole === 'student' && <th>Level</th>}
                          <th>Email</th>
                          <th>Phone</th>
                          <th>Joined</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRoster.length === 0 ? (
                          <tr><td colSpan="7" className="muted text-center" style={{ padding: 24 }}>No records found matching criteria.</td></tr>
                        ) : (
                          filteredRoster.map(u => (
                            <tr key={u.id}>
                              <td><strong>{u.full_name}</strong></td>
                              {rosterRole === 'student' && (
                                <td>
                                  <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
                                    {u.matric_no || '—'}
                                  </code>
                                </td>
                              )}
                              <td>{u.department_name || u.department || '—'}</td>
                              {rosterRole === 'student' && <td>{u.level ? `${u.level}L` : '—'}</td>}
                              <td className="small muted">{u.email}</td>
                              <td className="small muted">{u.phone || '—'}</td>
                              <td className="small muted">{new Date(u.created_at).toLocaleDateString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: FACULTIES & DEPARTMENTS STRUCTURE */}
            {tab === 'structure' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>Academic Hierarchy</h3>
                    <div className="small muted">School Code: <strong>{schoolCode}</strong></div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowAddFac(true)}>
                      + Add Faculty
                    </button>
                    <button className="btn btn-sm" onClick={() => setShowAddDept(true)}>
                      + Add Department
                    </button>
                  </div>
                </div>

                {institutionStructure?.faculties?.map(f => (
                  <div key={f.id} className="card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 12 }}>
                      <div>
                        <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{f.name}</span>
                        <span className="badge badge-submitted" style={{ marginLeft: 8 }}>Code: {f.code}</span>
                      </div>
                      <span className="small muted">{f.departments?.length || 0} Departments</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                      {f.departments?.map(d => (
                        <div key={d.id} style={{
                          padding: '12px 14px',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)'
                        }}>
                          <div style={{ fontWeight: 600 }}>{d.name}</div>
                          <div className="small muted" style={{ marginTop: 2 }}>
                            Code: <code style={{ color: 'var(--success)' }}>{d.code}</code>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* MODAL: ADD FACULTY */}
        {showAddFac && (
          <div className="modal-backdrop" onClick={() => setShowAddFac(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>Add Faculty</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowAddFac(false)}>✕</button>
              </div>

              <form onSubmit={handleCreateFaculty}>
                <div className="field">
                  <label className="label" htmlFor="new_fac_name">Faculty Name</label>
                  <input
                    id="new_fac_name"
                    type="text"
                    className="input"
                    placeholder="e.g. Faculty of Natural Sciences"
                    value={newFacName}
                    onChange={e => setNewFacName(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label className="label" htmlFor="new_fac_code">Faculty Code (Short Code)</label>
                  <input
                    id="new_fac_code"
                    type="text"
                    className="input"
                    placeholder="e.g. SCI"
                    style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}
                    value={newFacCode}
                    onChange={e => setNewFacCode(e.target.value.toUpperCase())}
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddFac(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm" disabled={addFacLoading}>
                    {addFacLoading ? 'Adding…' : 'Save Faculty'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: ADD DEPARTMENT */}
        {showAddDept && (
          <div className="modal-backdrop" onClick={() => setShowAddDept(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>Add Department</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowAddDept(false)}>✕</button>
              </div>

              <form onSubmit={handleCreateDepartment}>
                <div className="field">
                  <label className="label" htmlFor="parent_fac">Select Faculty</label>
                  <select
                    id="parent_fac"
                    className="input"
                    value={newDeptFacId}
                    onChange={e => setNewDeptFacId(e.target.value)}
                    required
                  >
                    {institutionStructure?.faculties?.map(f => (
                      <option key={f.id} value={f.id}>{f.name} ({f.code})</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label" htmlFor="new_dept_name">Department Name</label>
                  <input
                    id="new_dept_name"
                    type="text"
                    className="input"
                    placeholder="e.g. Software Engineering"
                    value={newDeptName}
                    onChange={e => setNewDeptName(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label className="label" htmlFor="new_dept_code">Department Code (Used in Matric No.)</label>
                  <input
                    id="new_dept_code"
                    type="text"
                    className="input"
                    placeholder="e.g. SEN"
                    style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}
                    value={newDeptCode}
                    onChange={e => setNewDeptCode(e.target.value.toUpperCase())}
                    required
                  />
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Student matrics in this department will format as: <code>YYYY/[FAC]/[CODE]/XXXX</code>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddDept(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm" disabled={addDeptLoading}>
                    {addDeptLoading ? 'Adding…' : 'Save Department'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
