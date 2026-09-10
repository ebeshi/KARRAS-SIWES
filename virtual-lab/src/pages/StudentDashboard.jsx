import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { enrollInManual, listManualsForStudent } from '../lib/manualsQueries.js'

const TABS = [
  { key: 'manuals', label: 'My Lab Manuals' },
  { key: 'assignments', label: 'Standalone Assignments' },
]

const statusBadge = (status) => {
  if (status === 'graded') return <span className="badge badge-graded">Graded</span>
  if (status === 'submitted') return <span className="badge badge-submitted">Submitted</span>
  return <span className="badge badge-notstarted">Not started</span>
}

const fmtDeadline = (iso) => {
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

export default function StudentDashboard() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('manuals')
  const [manuals, setManuals] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [enrolling, setEnrolling] = useState(null)

  useEffect(() => {
    if (!profile) return
    const load = async () => {
      setLoading(true); setErr(null)
      try {
        const [ms, asgns, subs] = await Promise.all([
          listManualsForStudent(profile.id),
          supabase
            .from('assignments')
            .select('id, title, description, deadline, created_at, manual_pdf_url, users!assignments_instructor_id_fkey(full_name)')
            .order('deadline', { ascending: false }),
          supabase
            .from('submissions')
            .select('assignment_id, status')
            .eq('student_id', profile.id),
        ])
        setManuals(ms)
        const subMap = {}
        for (const s of subs?.data || []) subMap[s.assignment_id] = s.status
        const now = new Date()
        setAssignments((asgns?.data || []).map((a) => {
          const status = subMap[a.id] || 'not_started'
          return { ...a, status, past: new Date(a.deadline) < now }
        }))
      } catch (e) {
        console.error(e)
        setErr(e.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [profile])

  const handleEnroll = async (m) => {
    if (enrolling) return
    setEnrolling(m.id)
    try {
      await enrollInManual(m.id, profile.id)
      setManuals((prev) => prev.map((x) => x.id === m.id ? { ...x, enrolled: true } : x))
    } catch (e) {
      const msg = 'Enroll failed: ' + (e.message || String(e))
      alert(msg)
    } finally {
      setEnrolling(null)
    }
  }

  const stats = useMemo(() => {
    const totalTasks = manuals.reduce((a, m) => a + (m.task_count || 0), 0)
    const done = manuals.reduce((a, m) => a + (m.submitted_count || 0), 0)
    const enrolledCount = manuals.filter((m) => m.enrolled).length
    return { totalTasks, done, enrolledCount }
  }, [manuals])

  const doSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const karrasChip = (
    <a href="/" className="karras-chip" title="Back to KARRAS platform">
      <img src="/k-logo.svg" alt="" width="14" height="14" style={{ display: 'block' }} />
      KARRAS
    </a>
  )

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>My work</h1>
          <div className="subtitle">{profile?.full_name}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {karrasChip}
          <button className="btn btn-secondary btn-sm" onClick={doSignOut}>Sign out</button>
        </div>
      </div>

      <div className="page">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key}
              className={'tab' + (tab === t.key ? ' tab-active' : '')}
              onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {err && <div className="error">{err}</div>}

        {tab === 'manuals' && (
          <>
            <div className="stat-grid" style={{ marginBottom: 18 }}>
              <div className="stat-card"><div className="stat-label">Manuals</div><div className="stat-value">{manuals.length}</div></div>
              <div className="stat-card"><div className="stat-label">Enrolled</div><div className="stat-value">{stats.enrolledCount}</div></div>
              <div className="stat-card"><div className="stat-label">Total tasks</div><div className="stat-value">{stats.totalTasks}</div></div>
              <div className="stat-card"><div className="stat-label">Completed</div><div className="stat-value">{stats.done}</div></div>
            </div>

            {loading ? (
              <div className="card"><p className="muted text-center mb-0">Loading…</p></div>
            ) : manuals.length === 0 ? (
              <div className="empty">No manuals yet. Ask your instructor for your course manual.</div>
            ) : (
              manuals.map((m) => {
                const pct = m.progress_pct || 0
                const closed = new Date(m.deadline) < new Date()
                return (
                  <div key={m.id} className="manual-card">
                    <div className="row" style={{ alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="list-item-title">
                          <span className="course-chip">{m.course_code}</span>
                          {m.title}
                        </div>
                        <div className="list-item-meta">
                          <span>{m.semester || '—'}</span>
                          {closed
                            ? <span className="deadline-past">Closed · {fmtDeadline(m.deadline)}</span>
                            : <span>Due: {fmtDeadline(m.deadline)}</span>
                          }
                          <span className="badge badge-notstarted" style={{ marginLeft: 'auto' }}>
                            {m.task_count || 0} task{m.task_count === 1 ? '' : 's'}
                          </span>
                        </div>
                        {m.description && <p className="small muted mb-0" style={{ marginTop: 6 }}>{m.description.length > 140 ? m.description.slice(0,140) + '…' : m.description}</p>}
                        <div className="progress-wrap" style={{ marginTop: 10 }}>
                          <div className="progress-bar"><div className="progress-fill" style={{ width: pct + '%' }} /></div>
                          <div className="small muted" style={{ marginTop: 4 }}>{pct}% · {m.submitted_count}/{m.task_count} tasks submitted</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                        {!m.enrolled ? (
                          <button className="btn btn-sm" onClick={() => handleEnroll(m)} disabled={enrolling === m.id || closed}>
                            {enrolling === m.id ? '…' : 'Enroll'}
                          </button>
                        ) : (
                          <Link to={`/student/manual/${m.id}`} className="btn btn-sm">
                            {m.task_count ? 'Continue' : 'Open'}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </>
        )}

        {tab === 'assignments' && (
          loading ? (
            <div className="card"><p className="muted text-center mb-0">Loading…</p></div>
          ) : assignments.length === 0 ? (
            <div className="empty">No standalone assignments yet.</div>
          ) : (
            assignments.map((a) => (
              <Link key={a.id} to={`/student/assignment/${a.id}`} className="list-item">
                <div className="row">
                  <div className="list-item-title grow">{a.title}</div>
                  {statusBadge(a.status)}
                </div>
                <div className="list-item-meta" style={{ marginTop: 4 }}>
                  <span>Instructor: {a.users?.full_name || '—'}</span>
                </div>
                <div className="list-item-meta">
                  <span className={a.past ? 'deadline-past' : ''}>
                    {a.past ? 'Closed · ' : 'Due: '}{fmtDeadline(a.deadline)}
                  </span>
                </div>
              </Link>
            ))
          )
        )}
      </div>
    </div>
  )
}
