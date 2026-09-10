import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  listManualsForInstructor, createManual, upsertTasksForManual,
  deleteManual,
} from '../lib/manualsQueries.js'
import { validateManualImport, SAMPLE_IMPORT } from '../lib/importSchema.js'

const TABS = [
  { key: 'manuals', label: 'Lab Manuals' },
  { key: 'assignments', label: 'Standalone Assignments' },
]

export default function InstructorDashboard() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('manuals')
  const [loading, setLoading] = useState(true)

  // Manual form
  const [courseCode, setCourseCode] = useState('')
  const [mTitle, setMTitle] = useState('')
  const [mDescription, setMDescription] = useState('')
  const [mSemester, setMSemester] = useState('')
  const [mDeadline, setMDeadline] = useState('')
  const [mPublished, setMPublished] = useState(false)
  const [mPdf, setMPdf] = useState(null)

  // Assignments form
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [expectedOutput, setExpectedOutput] = useState('')
  const [deadline, setDeadline] = useState('')
  const [manualPdfFile, setManualPdfFile] = useState(null)

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [formSuccess, setFormSuccess] = useState(false)

  const [assignments, setAssignments] = useState([])
  const [manuals, setManuals] = useState([])

  const [importOpen, setImportOpen] = useState(false)
  const [importMode, setImportMode] = useState('json')
  const [importText, setImportText] = useState(() => JSON.stringify(SAMPLE_IMPORT, null, 2))
  const [importPdf, setImportPdf] = useState(null)
  const [importError, setImportError] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const supabaseStorageUrl = `${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/manuals`

  const refresh = async () => {
    if (!profile) return
    setLoading(true)
    try {
      const [ms, as] = await Promise.all([
        listManualsForInstructor(profile.id),
        supabase
          .from('assignments')
          .select(`id, title, description, deadline, created_at, manual_pdf_url, submissions (id)`)
          .eq('instructor_id', profile.id)
          .order('created_at', { ascending: false }),
      ])
      setManuals(ms)
      setAssignments((as?.data || []).map((a) => ({
        ...a,
        submission_count: (a.submissions || []).length,
      })))
    } catch (err) {
      console.error(err)
      setFormError(err.message || 'Could not load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (profile) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const uploadPdf = async (file) => {
    if (!file) return null
    if (file.type && file.type !== 'application/pdf') {
      throw new Error('Manual must be a PDF file.')
    }
    if (file.size > 20 * 1024 * 1024) {
      throw new Error('Manual PDF must be under 20MB.')
    }
    const safeSlug = (mTitle.trim() || courseCode.trim() || 'manual').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'manual'
    const path = `${Date.now()}-${safeSlug}-${Math.random().toString(36).slice(2, 8)}.pdf`
    const { error: upErr } = await supabase.storage
      .from('manuals')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: 'application/pdf' })
    if (upErr) throw new Error(`PDF upload failed: ${upErr.message || String(upErr)}`)
    return `${supabaseStorageUrl}/${path}`
  }

  const handleCreateManual = async (e) => {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    setFormError(null)
    setFormSuccess(false)
    try {
      if (!courseCode.trim()) throw new Error('Course code is required (e.g. CSC222)')
      if (!mTitle.trim()) throw new Error('Manual title is required')
      if (!mDeadline) throw new Error('Semester deadline is required')
      const manualPdfUrl = mPdf ? await uploadPdf(mPdf) : null
      const manual = await createManual({
        instructor_id: profile.id,
        course_code: courseCode.trim(),
        title: mTitle.trim(),
        description: mDescription.trim(),
        semester: mSemester.trim() || null,
        manual_pdf_url: manualPdfUrl,
        deadline: new Date(mDeadline).toISOString(),
        published: mPublished,
      })
      setCourseCode(''); setMTitle(''); setMDescription(''); setMSemester(''); setMDeadline(''); setMPublished(false); setMPdf(null)
      if (document.getElementById('manual_pdf_manuals')) document.getElementById('manual_pdf_manuals').value = ''
      setFormSuccess(`Manual "${manual.title}" created. Open it to add tasks or use the Bulk Import wizard.`)
      navigate(`/instructor/manual/${manual.id}`)
      await refresh()
    } catch (err) {
      setFormError(err.message || 'Could not create manual')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateAssignment = async (e) => {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    setFormError(null)
    setFormSuccess(false)
    try {
      if (!title.trim()) throw new Error('Title is required')
      if (!deadline) throw new Error('Deadline is required')
      const url = manualPdfFile ? await uploadPdf(manualPdfFile) : null
      await supabase.from('assignments').insert({
        instructor_id: profile.id,
        title: title.trim(),
        description: description.trim(),
        expected_output: expectedOutput.trim() || null,
        manual_pdf_url: url,
        deadline: new Date(deadline).toISOString(),
      })
      setTitle(''); setDescription(''); setExpectedOutput(''); setDeadline(''); setManualPdfFile(null)
      if (document.getElementById('manual_pdf')) document.getElementById('manual_pdf').value = ''
      setFormSuccess('Assignment created.')
      await refresh()
    } catch (err) {
      setFormError(err.message || 'Could not create assignment')
    } finally {
      setSaving(false)
    }
  }

  const runImport = async () => {
    setImportError(null)
    setImportResult(null)
    setImporting(true)
    try {
      let json
      try { json = JSON.parse(importText) } catch (e) { throw new Error('JSON parse failed: ' + e.message) }
      const valid = validateManualImport(json)
      if (!valid.ok) throw new Error('Invalid import:\n• ' + valid.errors.join('\n• '))
      if (!profile) throw new Error('Not signed in')
      const m = valid.normalized

      let manual_pdf_url = null
      if (importPdf) {
        const url = await uploadPdf(importPdf)
        if (url) manual_pdf_url = url
      }

      const manual = await createManual({
        instructor_id: profile.id,
        course_code: m.course_code,
        title: m.title,
        description: m.description,
        semester: m.semester,
        deadline: m.deadline,
        published: m.published,
        import_batch_id: m.import_batch_id,
        manual_pdf_url,
      })
      const tasks = await upsertTasksForManual(manual.id, m.tasks)
      setImportResult({ manual, tasksCount: tasks.length })
      setImportOpen(false)
      setImportText(JSON.stringify(SAMPLE_IMPORT, null, 2))
      setImportPdf(null)
      navigate(`/instructor/manual/${manual.id}`)
      await refresh()
    } catch (err) {
      setImportError(err.message || String(err))
    } finally {
      setImporting(false)
    }
  }

  const doSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const handleDeleteManual = async (e, m) => {
    if (e) { e.preventDefault(); e.stopPropagation() }
    const ok = window.confirm(`Delete manual "${m.course_code} — ${m.title}"?\nAll ${m.task_count || 0} tasks and submissions will be erased. This cannot be undone.`)
    if (!ok) return
    setDeletingId(m.id)
    try {
      if (m.manual_pdf_url) {
        const path = m.manual_pdf_url.split('/object/public/manuals/').pop()
        if (path) {
          try { await supabase.storage.from('manuals').remove([path]) } catch (_) {}
        }
      }
      await deleteManual(m.id)
      await refresh()
    } catch (err) {
      alert(`Delete failed: ${err.message || String(err)}`)
    } finally {
      setDeletingId(null)
    }
  }

  const fmtDeadline = (iso) => {
    try { return new Date(iso).toLocaleString() } catch { return iso }
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
          <h1>Instructor Dashboard</h1>
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
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={'tab' + (tab === t.key ? ' tab-active' : '')}
              onClick={() => { setTab(t.key); setFormError(null); setFormSuccess(false) }}
            >
              {t.label}
            </button>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setImportOpen(true)}>
              Bulk import manual + tasks (JSON)
            </button>
          </div>
        </div>

        {formError && <div className="error">{formError}</div>}
        {formSuccess && <div className="success">{formSuccess}</div>}

        {tab === 'manuals' && (
          <>
            <div className="card">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <h2 className="mb-0">Create new lab manual</h2>
                <span className="muted small" style={{ marginTop: 6 }}>
                  Lab manuals are the semester-long unit. Students see tasks in manual order, tied to PDF sections.
                </span>
              </div>
              <form onSubmit={handleCreateManual} style={{ marginTop: 14 }}>
                <div className="grid-2">
                  <div className="field">
                    <label className="label" htmlFor="course_code">Course code</label>
                    <input id="course_code" className="input" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder="e.g. CSC222" required />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="m_title">Title</label>
                    <input id="m_title" className="input" value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="Game Programming with Pygame — Lab Manual" required />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="m_semester">Semester <span className="muted small">(optional)</span></label>
                    <input id="m_semester" className="input" value={mSemester} onChange={(e) => setMSemester(e.target.value)} placeholder="2026/27 Semester 1" />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="m_deadline">Semester deadline</label>
                    <input id="m_deadline" type="datetime-local" className="input" value={mDeadline} onChange={(e) => setMDeadline(e.target.value)} required />
                  </div>
                </div>
                <div className="field">
                  <label className="label" htmlFor="m_desc">Description <span className="muted small">(optional)</span></label>
                  <textarea id="m_desc" className="textarea" value={mDescription} onChange={(e) => setMDescription(e.target.value)} placeholder="Summary visible to students on the manual card." style={{ minHeight: 88 }} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="manual_pdf_manuals">Manual PDF <span className="muted small">(optional, attach later in the manual page)</span></label>
                  <input
                    id="manual_pdf_manuals"
                    type="file"
                    accept="application/pdf,.pdf"
                    className="input"
                    style={{ paddingInline: 10, lineHeight: 1.2, paddingBlock: 10 }}
                    onChange={(e) => { const f = e.target.files && e.target.files[0]; setMPdf(f || null) }}
                  />
                  {mPdf && <div className="small" style={{ marginTop: 6 }}><span className="muted">Selected:</span> {mPdf.name} <span className="muted">({Math.round(mPdf.size / 1024)} KB)</span></div>}
                </div>
                <div className="field inline-field">
                  <label>
                    <input type="checkbox" checked={mPublished} onChange={(e) => setMPublished(e.target.checked)} style={{ marginRight: 8 }} />
                    <span>Publish now (visible to enrolled students)</span>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="submit" className="btn" disabled={saving}>{saving ? 'Creating…' : 'Create manual'}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}>Instead — bulk import JSON</button>
                </div>
              </form>
            </div>

            <div className="card">
              <div className="row">
                <h2 className="mb-0">Your lab manuals</h2>
                <button className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading}>Refresh</button>
              </div>
              <div style={{ height: 16 }} />
              {loading ? (
                <p className="muted text-center">Loading…</p>
              ) : manuals.length === 0 ? (
                <div className="empty">No manuals yet. Create one above or use bulk import.</div>
              ) : (
                manuals.map((m) => (
                  <div key={m.id} className="list-item">
                    <div style={{ width: '100%' }}>
                      <div className="row" style={{ width: '100%', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="list-item-title">
                            <span className="course-chip">{m.course_code}</span>
                            {m.title}
                          </div>
                          <div className="list-item-meta">
                            <span>{m.semester || '—'}</span>
                            <span className="badge badge-submitted">{m.task_count || 0} task{m.task_count === 1 ? '' : 's'}</span>
                            <span className="badge badge-notstarted">{m.enrollment_count || 0} enrolled</span>
                            {m.published ? <span className="badge badge-graded">Published</span> : <span className="badge badge-notstarted">Draft</span>}
                          </div>
                          <div className="list-item-meta">
                            <span>Due: {fmtDeadline(m.deadline)}</span>
                          </div>
                          {m.description && <p className="small muted mt-lg mb-0">{m.description.length > 120 ? m.description.slice(0, 120) + '…' : m.description}</p>}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <Link to={`/instructor/manual/${m.id}`} className="btn btn-sm">Open</Link>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--danger)', borderColor: 'var(--danger)', padding: '6px 10px' }}
                            onClick={(e) => handleDeleteManual(e, m)}
                            disabled={deletingId === m.id}
                          >
                            {deletingId === m.id ? '…' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {tab === 'assignments' && (
          <>
            <div className="card">
              <h2>Create standalone assignment</h2>
              <div className="small muted mb-0">
                Use ad-hoc assignments for one-off problem sets. For manuals with multiple ordered tasks, use the Lab Manuals tab.
              </div>
              <form onSubmit={handleCreateAssignment} style={{ marginTop: 14 }}>
                <div className="field">
                  <label className="label" htmlFor="title">Title</label>
                  <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Introduction to Arrays" required />
                </div>
                <div className="field">
                  <label className="label" htmlFor="description">Description</label>
                  <textarea id="description" className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the assignment, starter code, expected output…" />
                </div>
                <div className="field">
                  <label className="label" htmlFor="expected_output">Expected Output <span className="muted small">(optional)</span></label>
                  <textarea
                    id="expected_output" className="textarea" value={expectedOutput} onChange={(e) => setExpectedOutput(e.target.value)}
                    style={{ minHeight: 84, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.95rem' }}
                    placeholder={`e.g.\nHello, World!`}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="manual_pdf">Manual PDF <span className="muted small">(optional)</span></label>
                  <input
                    id="manual_pdf" type="file" accept="application/pdf,.pdf" className="input"
                    style={{ paddingInline: 10, lineHeight: 1.2, paddingBlock: 10 }}
                    onChange={(e) => { const f = e.target.files && e.target.files[0]; setManualPdfFile(f || null) }}
                  />
                  {manualPdfFile && (
                    <div className="small" style={{ marginTop: 6 }}>
                      <span className="muted">Selected:</span> {manualPdfFile.name} <span className="muted">({Math.round(manualPdfFile.size / 1024)} KB)</span>
                    </div>
                  )}
                </div>
                <div className="field">
                  <label className="label" htmlFor="deadline">Deadline</label>
                  <input id="deadline" type="datetime-local" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-block" disabled={saving}>{saving ? 'Creating…' : 'Create assignment'}</button>
              </form>
            </div>

            <div className="card">
              <div className="row">
                <h2 className="mb-0">Your assignments</h2>
                <button className="btn btn-secondary btn-sm" onClick={refresh}>Refresh</button>
              </div>
              <div style={{ height: 16 }} />
              {assignments.length === 0 && !loading ? (
                <div className="empty">No standalone assignments yet.</div>
              ) : (
                assignments.map((a) => (
                  <Link key={a.id} to={`/instructor/assignment/${a.id}`} className="list-item">
                    <div className="row" style={{ width: '100%', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="list-item-title">{a.title}</div>
                        <div className="list-item-meta">
                          <span>Due: {fmtDeadline(a.deadline)}</span>
                          <span className="badge badge-submitted" style={{ marginLeft: 'auto' }}>
                            {a.submission_count} submission{a.submission_count === 1 ? '' : 's'}
                          </span>
                        </div>
                        {a.description && <p className="small muted mt-lg mb-0" style={{ marginTop: 8 }}>{a.description.length > 140 ? a.description.slice(0, 140) + '…' : a.description}</p>}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {importOpen && (
        <div className="modal-backdrop" onClick={() => { setImportOpen(false); setImportError(null); setImportResult(null); setImportPdf(null) }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h2 className="mb-0">Create a lab manual</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => { setImportOpen(false); setImportError(null); setImportResult(null); setImportPdf(null) }}>Close</button>
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Three ways to create a semester-long lab manual + its ordered tasks. Choose whichever has the least work for you.
            </div>

            <div className="tabs" role="tablist" style={{ marginTop: 16 }}>
              <button
                role="tab" aria-selected={importMode === 'json'}
                className={'tab sm' + (importMode === 'json' ? ' tab-active' : '')}
                onClick={() => setImportMode('json')}
              >
                1. Bulk JSON import
              </button>
              <button
                role="tab" aria-selected={importMode === 'pdf-ai'}
                className={'tab sm' + (importMode === 'pdf-ai' ? ' tab-active' : '')}
                onClick={() => setImportMode('pdf-ai')}
              >
                2. Extract tasks from PDF (AI)
              </button>
              <button
                role="tab" aria-selected={importMode === 'manual'}
                className={'tab sm' + (importMode === 'manual' ? ' tab-active' : '')}
                onClick={() => { setImportOpen(false); setTimeout(() => { const el = document.getElementById('course_code'); if (el) el.focus() }, 80) }}
              >
                3. Create manually (per-task editor)
              </button>
            </div>

            {importMode === 'json' && (
              <>
                {importError && <div className="error" style={{ whiteSpace: 'pre-wrap' }}>{importError}</div>}
                {importResult && <div className="success">Imported &quot;{importResult.manual.course_code} — {importResult.manual.title}&quot; with {importResult.tasksCount} tasks.</div>}
                <div className="field" style={{ marginTop: 4 }}>
                  <label className="label" htmlFor="import_json">
                    Paste or upload your manual + tasks JSON
                    <span className="small muted" style={{ marginLeft: 8 }}>(template below — replace the values)</span>
                  </label>
                  <textarea
                    id="import_json"
                    className="textarea"
                    style={{ minHeight: 320, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13, lineHeight: 1.5 }}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    spellCheck={false}
                  />
                </div>

                <div className="field" style={{ marginTop: 4 }}>
                  <label className="label" htmlFor="import_json_pdf">
                    Manual PDF
                    <span className="small muted" style={{ marginLeft: 8 }}>(optional — attach it now so students can jump straight to page ranges)</span>
                  </label>
                  <input
                    id="import_json_pdf"
                    type="file"
                    accept="application/pdf,.pdf"
                    className="input"
                    style={{ paddingInline: 10, lineHeight: 1.2, paddingBlock: 10 }}
                    onChange={(e) => { const f = e.target.files?.[0]; setImportPdf(f || null) }}
                  />
                  {importPdf && (
                    <div className="small" style={{ marginTop: 6 }}>
                      <span className="muted">Selected:</span> {importPdf.name} <span className="muted">({Math.round(importPdf.size / 1024)} KB)</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImportPdf(null)} style={{ marginLeft: 8, padding: '2px 8px' }}>Remove</button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setImportText(JSON.stringify(SAMPLE_IMPORT, null, 2))}>Restore template</button>
                    <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                      Load JSON file
                      <input
                        type="file"
                        accept="application/json,.json,text/plain"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          const text = await f.text()
                          setImportText(text)
                        }}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setImportOpen(false); setImportError(null); setImportPdf(null) }}>Cancel</button>
                    <button className="btn btn-sm" onClick={runImport} disabled={importing}>{importing ? 'Importing…' : 'Validate + import'}</button>
                  </div>
                </div>
              </>
            )}

            {importMode === 'pdf-ai' && (
              <div style={{
                border: '1px dashed rgba(255,255,255,0.16)',
                borderRadius: 20,
                padding: 24,
                marginTop: 4,
                textAlign: 'center'
              }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>📚 AI extract from manual PDF</h3>
                <p className="small muted" style={{ marginTop: 8, marginBottom: 8 }}>
                  Upload a manual PDF and we&apos;ll automatically extract the ordered task list, starter code, page ranges, and expected outputs.
                </p>
                <input type="file" accept="application/pdf,.pdf" disabled style={{ opacity: 0.5, margin: '10px auto', display: 'block' }} />
                <div className="small" style={{ color: 'var(--warning)' }}>
                  Coming soon — not available in this prototype yet. Use Option 1 (Bulk JSON) or Option 3 (per-task editor) in the meantime.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
