import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import {
  getManualDetailForInstructor, upsertTasksForManual, deleteTasksById,
  getManualProgressRows, updateManual,
} from '../lib/manualsQueries.js'
import { buildManualGradeCsv, downloadCsv } from '../lib/csv.js'

const DETAIL_TABS = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'progress', label: 'Progress & Grading' },
  { key: 'settings', label: 'Manual settings' },
]

const emptyTask = (idx) => ({
  id: null,
  order_index: idx,
  title: '',
  instruction_text: '',
  pdf_section_label: '',
  pdf_page_start: null,
  pdf_page_end: null,
  language: 'python',
  starter_code: '',
  expected_output: '',
  points: 10,
  _new: true,
  _dirty: true,
})

export default function InstructorManualDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('tasks')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [manual, setManual] = useState(null)
  const [tasks, setTasks] = useState([])
  const [progressRows, setProgressRows] = useState([])
  const [savingTasks, setSavingTasks] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)

  const [mPdf, setMPdf] = useState(null)
  const [patchSaving, setPatchSaving] = useState(false)

  const supabaseStorageUrl = `${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/manuals`

  const load = async () => {
    if (!id || !profile) return
    setLoading(true); setErr(null)
    try {
      const { manual: m, tasks: ts } = await getManualDetailForInstructor(id, profile.id)
      setManual(m)
      setTasks(ts.length ? ts : [emptyTask(1)])
      setProgressRows(await getManualProgressRows(id, ts))
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id, profile?.id])

  const onChangeTask = (idx, patch) => {
    setTasks((prev) => prev.map((t, i) => i === idx ? { ...t, ...patch, _dirty: true } : t))
  }

  const addTask = () => {
    setTasks((prev) => {
      const idx = prev.length ? Math.max(...prev.map((t) => Number(t.order_index) || 0)) + 1 : 1
      return [...prev, emptyTask(idx)]
    })
  }

  const moveTask = (idx, dir) => {
    setTasks((prev) => {
      if (idx + dir < 0 || idx + dir >= prev.length) return prev
      const copy = prev.slice()
      const swap = copy[idx]
      copy[idx] = { ...copy[idx + dir], order_index: (Number(swap.order_index) || 0), _dirty: true }
      copy[idx + dir] = { ...swap, order_index: (Number(copy[idx + dir].order_index) || 0), _dirty: true }
      // re-number order_index so unique ordering holds
      return copy.map((t, i) => ({ ...t, order_index: i + 1, _dirty: true }))
    })
  }

  const removeTask = (idx) => {
    setTasks((prev) => {
      if (prev.length <= 1) {
        const ok = window.confirm('Remove the only task?')
        if (!ok) return prev
        return [{ ...emptyTask(1), _dirty: true }]
      }
      const copy = prev.slice()
      copy.splice(idx, 1)
      return copy.map((t, i) => ({ ...t, order_index: i + 1, _dirty: true }))
    })
  }

  const saveTasks = async () => {
    setSavingTasks(true); setSaveMsg(null)
    try {
      if (!manual) return
      const normalized = tasks
        .map((t, i) => ({
          id: t.id || undefined,
          manual_id: manual.id,
          order_index: i + 1,
          title: String(t.title || '').trim() || `Task ${i + 1}`,
          instruction_text: String(t.instruction_text || ''),
          pdf_section_label: t.pdf_section_label ? String(t.pdf_section_label).trim() : null,
          pdf_page_start: typeof t.pdf_page_start === 'number' ? t.pdf_page_start : Number.isFinite(+t.pdf_page_start) ? +t.pdf_page_start : null,
          pdf_page_end: typeof t.pdf_page_end === 'number' ? t.pdf_page_end : Number.isFinite(+t.pdf_page_end) ? +t.pdf_page_end : null,
          language: t.language === 'javascript' ? 'javascript' : 'python',
          starter_code: String(t.starter_code || ''),
          expected_output: t.expected_output ? String(t.expected_output) : null,
          points: Number.isFinite(+t.points) ? Math.max(0, +t.points) : 10,
        }))

      const existingIds = tasks.map((t) => t.id).filter(Boolean)
      const serverCurrent = await supabase.from('tasks').select('id').eq('manual_id', manual.id)
      const serverIds = new Set((serverCurrent?.data || []).map((t) => t.id))
      const toDelete = existingIds.filter((id) => !serverIds.has(id))
      if (toDelete.length) await deleteTasksById(toDelete)

      const upserted = await upsertTasksForManual(manual.id, normalized)
      const refreshed = upserted.slice().sort((a, b) => a.order_index - b.order_index)
      setTasks(refreshed)
      setProgressRows(await getManualProgressRows(id, refreshed))
      setSaveMsg({ type: 'success', text: `Saved ${refreshed.length} task${refreshed.length === 1 ? '' : 's'}.` })
    } catch (e) {
      setSaveMsg({ type: 'error', text: e.message || String(e) })
    } finally {
      setSavingTasks(false)
      setTimeout(() => setSaveMsg(null), 3000)
    }
  }

  const exportCsv = () => {
    const { rows } = buildManualGradeCsv({ manual, tasks, rows: progressRows })
    const safeSlug = (manual?.course_code || 'manual').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    downloadCsv(rows, `${safeSlug}-grades-${new Date().toISOString().slice(0,10)}.csv`)
  }

  const patchManual = async (patch) => {
    setPatchSaving(true); setSaveMsg(null)
    try {
      const next = await updateManual(manual.id, patch)
      setManual(next)
      setSaveMsg({ type: 'success', text: 'Saved.' })
    } catch (e) {
      setSaveMsg({ type: 'error', text: e.message || String(e) })
    } finally {
      setPatchSaving(false)
      setTimeout(() => setSaveMsg(null), 2500)
    }
  }

  const saveManualPdf = async () => {
    if (!mPdf || !manual) return
    setPatchSaving(true); setSaveMsg(null)
    try {
      const file = mPdf
      if (file.type && file.type !== 'application/pdf') throw new Error('PDF only')
      if (file.size > 20 * 1024 * 1024) throw new Error('PDF must be under 20MB')
      const safeSlug = (manual.course_code || manual.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
      const path = `${Date.now()}-${safeSlug}-${Math.random().toString(36).slice(2,8)}.pdf`
      const { error: upErr } = await supabase.storage
        .from('manuals')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: 'application/pdf' })
      if (upErr) throw new Error('PDF upload failed: ' + (upErr.message || String(upErr)))
      const url = `${supabaseStorageUrl}/${path}`
      await patchManual({ manual_pdf_url: url })
      setMPdf(null)
      if (document.getElementById('manual_pdf_detail')) document.getElementById('manual_pdf_detail').value = ''
    } catch (e) {
      setSaveMsg({ type: 'error', text: e.message || String(e) })
      setPatchSaving(false)
    }
  }

  const progressStats = useMemo(() => {
    const tasksCount = tasks.length
    const total = progressRows.length
    const submittedStudents = progressRows.filter((r) => r.statusLabel !== 'Not started').length
    const avg = total ? (progressRows.reduce((a, r) => a + r.pct, 0) / total).toFixed(1) : 0
    return { tasksCount, total, submittedStudents, avg }
  }, [progressRows, tasks])

  const karrasChip = (
    <a href="/" className="karras-chip" title="Back to KARRAS platform">
      <img src="/k-logo.svg" alt="" width="14" height="14" style={{ display: 'block' }} />
      KARRAS
    </a>
  )

  if (loading && !manual) return <div className="page"><div className="card"><p className="muted text-center">Loading…</p></div></div>
  if (err) return <div className="page"><div className="card"><div className="error">{err}</div><Link to="/instructor" className="back-link">← Back to dashboard</Link></div></div>
  if (!manual) return <div className="page"><div className="card"><p className="text-center mb-0">Not found.</p><Link to="/instructor" className="back-link">← Back</Link></div></div>

  return (
    <div>
      <div className="topbar">
        <div style={{ minWidth: 0 }}>
          <Link to="/instructor" className="back-link" style={{ marginBottom: 8, display: 'inline-block' }}>← Dashboard</Link>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="course-chip">{manual.course_code}</span>
            <h1 style={{ margin: 0, fontSize: 22 }}>{manual.title}</h1>
            {manual.published ? <span className="badge badge-graded">Published</span> : <span className="badge badge-notstarted">Draft</span>}
          </div>
          <div className="subtitle" style={{ marginTop: 6 }}>
            {manual.semester ? `${manual.semester} · ` : ''}
            Due: {new Date(manual.deadline).toLocaleString()}
            {' · '}{tasks.length} task{tasks.length === 1 ? '' : 's'} · {progressStats.total} enrolled
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={!tasks.length || !progressRows.length}>
            Export grades CSV
          </button>
          {karrasChip}
        </div>
      </div>

      <div className="page">
        <div className="tabs" role="tablist">
          {DETAIL_TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key}
              className={'tab' + (tab === t.key ? ' tab-active' : '')}
              onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {saveMsg && (
          <div className={saveMsg.type === 'error' ? 'error' : 'success'} style={{ marginBottom: 14 }}>{saveMsg.text}</div>
        )}

        {tab === 'tasks' && (
          <>
            <div className="card">
              <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <h2 className="mb-0">Task list</h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={addTask}>+ Add task</button>
                  <button className="btn btn-sm" onClick={saveTasks} disabled={savingTasks}>
                    {savingTasks ? 'Saving…' : 'Save all tasks'}
                  </button>
                </div>
              </div>
              <div className="small muted mt-0 mb-0" style={{ marginTop: 6 }}>
                For each task, tie it to a section / page range in the manual PDF. Students get a "Jump to section" button directly on the task workspace.
              </div>
              <div style={{ height: 16 }} />
              {tasks.map((t, idx) => (
                <div key={t.id || `n-${idx}`} className="task-editor-card">
                  <div className="row" style={{ alignItems: 'center' }}>
                    <div className="task-order-pill">#{t.order_index || idx + 1}</div>
                    <div className="field mb-0" style={{ flex: '1 1 auto', minWidth: 200 }}>
                      <input className="input" placeholder="Task title (e.g. Task 2.1 Draw a rectangle)" value={t.title}
                        onChange={(e) => onChangeTask(idx, { title: e.target.value })} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => moveTask(idx, -1)} title="Move up" disabled={idx === 0}>↑</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => moveTask(idx, +1)} title="Move down" disabled={idx === tasks.length - 1}>↓</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeTask(idx)} title="Delete" style={{ color: 'var(--danger)' }}>✕</button>
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: 10 }}>
                    <div className="field">
                      <label className="label">PDF section</label>
                      <input className="input" value={t.pdf_section_label || ''} placeholder="e.g. Section 2.1"
                        onChange={(e) => onChangeTask(idx, { pdf_section_label: e.target.value })} />
                    </div>
                    <div className="field inline-field" style={{ alignItems: 'center' }}>
                      <label>Page range</label>
                      <div style={{ display: 'flex', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
                        <input type="number" className="input" placeholder="Start" style={{ maxWidth: 110 }}
                          value={t.pdf_page_start ?? ''}
                          onChange={(e) => onChangeTask(idx, { pdf_page_start: e.target.value === '' ? null : +e.target.value })} />
                        <input type="number" className="input" placeholder="End" style={{ maxWidth: 110 }}
                          value={t.pdf_page_end ?? ''}
                          onChange={(e) => onChangeTask(idx, { pdf_page_end: e.target.value === '' ? null : +e.target.value })} />
                      </div>
                    </div>
                    <div className="field">
                      <label className="label">Language</label>
                      <select className="input" value={t.language} onChange={(e) => onChangeTask(idx, { language: e.target.value })}>
                        <option value="python">Python</option>
                        <option value="javascript">JavaScript</option>
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Points (weight)</label>
                      <input type="number" className="input" min={0} value={t.points}
                        onChange={(e) => onChangeTask(idx, { points: +e.target.value || 0 })} />
                    </div>
                  </div>
                  <div className="field">
                    <label className="label">Instructions</label>
                    <textarea className="textarea" style={{ minHeight: 88 }} value={t.instruction_text}
                      onChange={(e) => onChangeTask(idx, { instruction_text: e.target.value })}
                      placeholder="Describe what the student must implement, or copy the manual task description here." />
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label className="label">Starter code (pre-filled in the student editor)</label>
                      <textarea className="textarea" style={{ minHeight: 130, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13, lineHeight: 1.55 }}
                        value={t.starter_code}
                        onChange={(e) => onChangeTask(idx, { starter_code: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Expected output (optional — for auto-check Run)</label>
                      <textarea className="textarea" style={{ minHeight: 130, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13, lineHeight: 1.55 }}
                        value={t.expected_output || ''}
                        onChange={(e) => onChangeTask(idx, { expected_output: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                <button className="btn btn-secondary btn-sm" onClick={addTask}>+ Add task below</button>
                <button className="btn" onClick={saveTasks} disabled={savingTasks}>{savingTasks ? 'Saving…' : 'Save all tasks'}</button>
              </div>
            </div>
          </>
        )}

        {tab === 'progress' && (
          <div className="card">
            <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <h2 className="mb-0">Progress and grading</h2>
                <div className="small muted">Every enrolled student × every task. Per-task grades are entered here; the CSV export sums them.</div>
              </div>
              <button className="btn btn-sm" onClick={exportCsv} disabled={!tasks.length || !progressRows.length}>
                Export grades CSV
              </button>
            </div>
            <div style={{ height: 12 }} />
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-label">Enrolled</div><div className="stat-value">{progressStats.total}</div></div>
              <div className="stat-card"><div className="stat-label">Started</div><div className="stat-value">{progressStats.submittedStudents}</div></div>
              <div className="stat-card"><div className="stat-label">Tasks</div><div className="stat-value">{progressStats.tasksCount}</div></div>
              <div className="stat-card"><div className="stat-label">Avg score</div><div className="stat-value">{progressStats.avg}%</div></div>
            </div>
            <div style={{ height: 16 }} />
            {!progressRows.length ? (
              <div className="empty">No student submissions yet. Enroll students and have them open the manual workspace to begin.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Matric No.</th>
                      <th>Level</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Dept / Faculty</th>
                      {tasks.map((t) => (
                        <th key={t.id || t.order_index}>
                          T{Number(t.order_index) || '?'}
                        </th>
                      ))}
                      <th>Total</th>
                      <th>%</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progressRows.map((r) => (
                      <tr key={r.studentId}>
                        <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{r.matricNo || '—'}</td>
                        <td>{r.level ? `${r.level}L` : '—'}</td>
                        <td>{r.fullName || '—'}</td>
                        <td>{r.email}</td>
                        <td className="small muted">
                          {r.department ? `${r.department}` : '—'}
                          {r.faculty && r.department ? ' · ' : ''}
                          {r.faculty ? r.faculty : ''}
                        </td>
                        {tasks.map((t) => {
                          const cell = r.taskGrades[t.id] || {}
                          return (
                            <td key={t.id || t.order_index}>
                              <GradeCell
                                initial={cell.grade}
                                status={cell.status}
                                onSave={async (g) => {
                                  const grade = g === '' ? null : Number(g)
                                  const status = (typeof grade === 'number') ? 'graded' : (cell.status || 'not_started')
                                  const payload = {
                                    task_id: t.id, student_id: r.studentId, manual_id: manual.id,
                                    grade, status,
                                  }
                                  try {
                                    await supabase.from('task_submissions').upsert(payload, { onConflict: 'task_id, student_id' })
                                    const refreshed = await getManualProgressRows(id, tasks)
                                    setProgressRows(refreshed)
                                  } catch (e) {
                                    alert('Grade save failed: ' + (e.message || String(e)))
                                  }
                                }}
                              />
                            </td>
                          )
                        })}
                        <td>{r.total}/{r.possible}</td>
                        <td>{r.pct}%</td>
                        <td>{r.statusLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div className="card">
            <h2>Manual settings</h2>
            <div className="grid-2" style={{ marginTop: 10 }}>
              <div className="field">
                <label className="label">Course code</label>
                <input className="input" value={manual.course_code}
                  onChange={(e) => setManual({ ...manual, course_code: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Title</label>
                <input className="input" value={manual.title}
                  onChange={(e) => setManual({ ...manual, title: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Semester</label>
                <input className="input" value={manual.semester || ''}
                  onChange={(e) => setManual({ ...manual, semester: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Semester deadline</label>
                <input type="datetime-local" className="input"
                  value={new Date(manual.deadline).toISOString().slice(0, 16)}
                  onChange={(e) => setManual({ ...manual, deadline: new Date(e.target.value).toISOString() })} />
              </div>
            </div>
            <div className="field">
              <label className="label">Description</label>
              <textarea className="textarea" style={{ minHeight: 100 }} value={manual.description || ''}
                onChange={(e) => setManual({ ...manual, description: e.target.value })} />
            </div>
            <div className="field inline-field">
              <label>
                <input type="checkbox" checked={!!manual.published}
                  onChange={(e) => setManual({ ...manual, published: e.target.checked })}
                  style={{ marginRight: 8 }} />
                <span>Published (students can see and enroll)</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => patchManual({
                course_code: manual.course_code, title: manual.title,
                semester: manual.semester || null, deadline: manual.deadline,
                description: manual.description || '', published: !!manual.published,
              })} disabled={patchSaving}>
                {patchSaving ? 'Saving…' : 'Save settings'}
              </button>
            </div>

            <div style={{ height: 18, borderTop: '1px dashed rgba(255,255,255,0.06)', margin: '24px 0 18px' }} />

            <h3 className="mb-0">Manual PDF</h3>
            <div className="small muted" style={{ marginTop: 4 }}>
              PDFs are public-read so students can view them inline in the mobile workspace without auth round-trips.
            </div>
            {manual.manual_pdf_url ? (
              <div className="pdf-viewer-card" style={{ marginTop: 12 }}>
                <div className="row">
                  <span className="badge badge-submitted">Attached</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a className="btn btn-secondary btn-sm" href={manual.manual_pdf_url} target="_blank" rel="noreferrer">Open PDF</a>
                  </div>
                </div>
                <iframe title="manual preview" src={manual.manual_pdf_url} style={{ width: '100%', height: 320, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', marginTop: 10, background: '#0a0a0a' }} />
              </div>
            ) : (
              <div className="empty" style={{ marginTop: 12 }}>No PDF attached yet.</div>
            )}
            <div className="field" style={{ marginTop: 12 }}>
              <label className="label" htmlFor="manual_pdf_detail">Upload / replace PDF</label>
              <input id="manual_pdf_detail" type="file" accept="application/pdf,.pdf" className="input"
                style={{ paddingInline: 10, lineHeight: 1.2, paddingBlock: 10 }}
                onChange={(e) => { const f = e.target.files?.[0]; setMPdf(f || null) }} />
              {mPdf && <div className="small" style={{ marginTop: 6 }}><span className="muted">Selected:</span> {mPdf.name} <span className="muted">({Math.round(mPdf.size / 1024)} KB)</span></div>}
            </div>
            <button className="btn btn-secondary" onClick={saveManualPdf} disabled={!mPdf || patchSaving}>Save PDF</button>
          </div>
        )}
      </div>
    </div>
  )
}

function GradeCell({ initial, status, onSave }) {
  const [val, setVal] = useState(initial ?? '')
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setVal(initial ?? ''); setDirty(false) }, [initial])
  const color = status === 'graded' ? 'var(--success)' : status === 'submitted' ? 'var(--warn)' : 'rgba(255,255,255,0.35)'
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input
        className="input"
        style={{ maxWidth: 64, padding: '4px 6px', borderColor: dirty ? color : 'rgba(255,255,255,0.12)' }}
        inputMode="decimal"
        value={val}
        onChange={(e) => { setVal(e.target.value); setDirty(true) }}
        onBlur={() => { if (dirty) onSave(val); setDirty(false) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.target.blur() } }}
        placeholder="—"
      />
    </div>
  )
}
