import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import { buildAssignmentGradeCsv, downloadCsv } from '../lib/csv.js'

export default function InstructorAssignmentDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [assignment, setAssignment] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [enrolled, setEnrolled] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState(null)
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    if (!id || !profile) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setLoadErr(null)
      try {
        const { data: asgn, error: aErr } = await supabase
          .from('assignments')
          .select('id, title, description, expected_output, manual_pdf_url, deadline, created_at, instructor_id, total_points')
          .eq('id', id)
          .single()
        if (aErr) throw aErr
        if (asgn.instructor_id !== profile.id) throw new Error('Not authorized')
        if (!cancelled) setAssignment(asgn)

        const { data: subs, error: sErr } = await supabase
          .from('submissions')
          .select(`
            id, student_id, submitted_at, grade, status, auto_passed,
            users!submissions_student_id_fkey(id, full_name, email, matric_no, faculty, department, level)
          `)
          .eq('assignment_id', id)
          .order('submitted_at', { ascending: true })
        if (sErr) throw sErr

        const { data: enr, error: eErr } = await supabase
          .from('assignment_enrollments')
          .select(`student_id, users!assignment_enrollments_student_id_fkey(id, full_name, email, matric_no, faculty, department, level)`)
          .eq('assignment_id', id)
        if (eErr && eErr.code !== '42P01') console.warn(eErr)

        if (!cancelled) {
          setSubmissions(subs || [])
          setEnrolled(enr || [])
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) setLoadErr(err.message || 'Could not load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, profile])

  const gradeRows = useMemo(() => {
    const byStudentId = new Map()
    const add = ({ id: studentId, full_name: fullName, email, matric_no: matricNo, faculty, department, level }) => {
      if (!studentId) return null
      if (byStudentId.has(studentId)) return byStudentId.get(studentId)
      const row = {
        studentId,
        fullName,
        email,
        matricNo,
        faculty,
        department,
        level,
        submissionId: null,
        submittedAt: '',
        status: 'not-started',
        statusLabel: 'Not started',
        autoPassed: null,
        grade: null,
      }
      byStudentId.set(studentId, row)
      return row
    }
    for (const s of submissions) {
      const row = add(s.users) || byStudentId.get(s.student_id)
      if (row) {
        row.submissionId = s.id
        row.submittedAt = s.submitted_at || ''
        row.status = s.status || 'submitted'
        row.statusLabel = s.status ? s.status.charAt(0).toUpperCase() + s.status.slice(1) : 'Submitted'
        row.autoPassed = s.auto_passed
        row.grade = s.grade
      }
    }
    for (const e of enrolled) {
      if (e && !byStudentId.has(e.student_id)) add(e.users)
    }
    return Array.from(byStudentId.values()).sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''))
  }, [submissions, enrolled])

  const saveGrade = async (submissionId, studentId, gradeValue) => {
    const num = gradeValue === '' || gradeValue == null ? null : Number(gradeValue)
    if (num !== null && (isNaN(num) || num < 0 || num > 10000)) {
      alert('Grade must be a number (leave blank if not graded).')
      return
    }
    setSaving(submissionId)
    try {
      if (submissionId) {
        const { error } = await supabase.from('submissions').update({ grade: num }).eq('id', submissionId)
        if (error) throw error
      }
      setSubmissions((prev) =>
        prev.map((s) => (s.id === submissionId ? { ...s, grade: num } : s))
      )
    } catch (err) {
      alert('Save failed: ' + (err.message || String(err)))
    } finally {
      setSaving(null)
    }
  }

  const exportCsv = () => {
    const safeTitle = (assignment?.title || 'assignment').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60)
    const { rows } = buildAssignmentGradeCsv({ assignment, rows: gradeRows })
    downloadCsv(rows, `${safeTitle}-grades.csv`)
  }

  const fmt = (iso) => {
    try { return iso ? new Date(iso).toLocaleString() : '' } catch { return iso || '' }
  }

  if (loading && !assignment) {
    return <div className="page"><div className="card"><p className="text-center muted">Loading…</p></div></div>
  }

  if (loadErr) {
    return (
      <div className="page">
        <div className="card">
          <div className="error">{loadErr}</div>
          <Link to="/instructor" className="back-link">← Back to dashboard</Link>
        </div>
      </div>
    )
  }

  if (!assignment) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-center mb-0">Assignment not found.</p>
          <div style={{ height: 12 }} />
          <Link to="/instructor" className="back-link">← Back</Link>
        </div>
      </div>
    )
  }

  const karrasChip = (
    <a href="/" className="karras-chip" title="Back to KARRAS platform">
      <img src="/k-logo.svg" alt="" width="14" height="14" style={{ display: 'block' }} />
      KARRAS
    </a>
  )

  const totalGradeRows = gradeRows.reduce((n, r) => n + (typeof r.grade === 'number' ? 1 : 0), 0)
  const gradePct = gradeRows.length ? Math.round((totalGradeRows / gradeRows.length) * 100) : 0

  return (
    <div>
      <div className="topbar">
        <div>
          <Link to="/instructor" className="back-link">← Back</Link>
        </div>
        {karrasChip}
      </div>
      <div className="page">
        <div className="card">
          <h2 className="mb-0">{assignment.title}</h2>
          <div className="list-item-meta" style={{ marginTop: 8 }}>
            <span>Due: {fmt(assignment.deadline)}</span>
            <span className="badge badge-submitted" style={{ marginLeft: 'auto' }}>
              {submissions.length} submission{submissions.length === 1 ? '' : 's'}
            </span>
          </div>
          {assignment.description && (
            <div style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>
              {assignment.description}
            </div>
          )}
          {assignment.expected_output && (
            <div className="expected-output" style={{ marginTop: 14 }}>
              <div className="small muted" style={{ marginBottom: 6, fontWeight: 600 }}>
                Expected output
              </div>
              <pre className="code-block" style={{ margin: 0 }}>{assignment.expected_output}</pre>
            </div>
          )}
          {assignment.manual_pdf_url && (
            <div style={{ marginTop: 14 }}>
              <div className="small muted" style={{ marginBottom: 6, fontWeight: 600 }}>
                Manual
              </div>
              <a
                href={assignment.manual_pdf_url}
                target="_blank"
                rel="noreferrer noopener"
                className="small"
              >
                Open attached PDF manual in new tab ↗
              </a>
            </div>
          )}
        </div>

        <div className="card">
          <div className="list-item-meta" style={{ marginBottom: 14 }}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>Progress & Grading</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span className="badge badge-submitted">{gradeRows.length} enrolled</span>
              <span className="badge badge-pass">{totalGradeRows} graded · {gradePct}%</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={exportCsv} disabled={!gradeRows.length}>
                Download CSV
              </button>
            </div>
          </div>

          {gradeRows.length === 0 ? (
            <div className="empty">No students enrolled or submitted yet.</div>
          ) : (
            <div className="table-wrapper">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Matric No.</th>
                    <th>Level</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Dept / Faculty</th>
                    <th>Auto</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {gradeRows.map((r) => {
                    const statusBadge = r.autoPassed === true
                      ? <span className="badge badge-pass">PASS</span>
                      : r.autoPassed === false
                        ? <span className="badge badge-fail">FAIL</span>
                        : <span className="badge badge-draft">—</span>
                    return (
                      <tr key={r.studentId}>
                        <td data-label="Matric No." style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
                          {r.matricNo || '—'}
                        </td>
                        <td data-label="Level">{r.level ? `${r.level}L` : '—'}</td>
                        <td data-label="Name" style={{ fontWeight: 600 }}>{r.fullName || '—'}</td>
                        <td data-label="Email" className="small muted">{r.email}</td>
                        <td data-label="Dept / Faculty" className="small muted">
                          {r.department || '—'}{r.faculty && r.department ? ' · ' : ''}{r.faculty || ''}
                        </td>
                        <td data-label="Auto">{statusBadge}</td>
                        <td data-label="Status">
                          <span className={`badge ${r.status === 'submitted' || r.status === 'graded' ? 'badge-submitted' : 'badge-draft'}`}>
                            {r.statusLabel}
                          </span>
                        </td>
                        <td data-label="Submitted" style={{ whiteSpace: 'nowrap' }}>
                          <span className="small muted">{r.submittedAt ? fmt(r.submittedAt) : '—'}</span>
                        </td>
                        <td data-label="Grade" style={{ whiteSpace: 'nowrap' }}>
                          <input
                            type="number"
                            min={0}
                            max={typeof assignment.total_points === 'number' ? assignment.total_points : 100}
                            step="0.5"
                            className="grade-input"
                            placeholder="0–100"
                            value={r.grade == null ? '' : r.grade}
                            onBlur={(e) => saveGrade(r.submissionId, r.studentId, e.target.value)}
                            disabled={!r.submissionId || saving === r.submissionId}
                            style={{ width: 76 }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
