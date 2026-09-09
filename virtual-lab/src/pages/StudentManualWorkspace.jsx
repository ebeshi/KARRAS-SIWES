import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import {
  getManualForStudentWorkspace, listStudentSubmissionsForManual,
  upsertTaskSubmission,
} from '../lib/manualsQueries.js'
import { runCode } from '../lib/runCode.js'
import CodeEditor from '../components/CodeEditor.jsx'

const fmt = (iso) => { try { return new Date(iso).toLocaleString() } catch { return iso } }

const pageParam = (url, start, end) => {
  if (!url) return null
  const hash = start != null ? `page=${start}` : null
  if (!hash) return url
  const sep = url.includes('#') ? '&' : '#'
  return url + sep + hash
}

const badgeFromStatus = (status) => {
  if (status === 'graded') return <span className="badge badge-graded">Graded</span>
  if (status === 'submitted') return <span className="badge badge-submitted">Submitted</span>
  if (status === 'in_progress') return <span className="badge badge-notstarted">Draft</span>
  return <span className="badge badge-notstarted">Not started</span>
}

export default function StudentManualWorkspace() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [manual, setManual] = useState(null)
  const [tasks, setTasks] = useState([])
  const [taskIdx, setTaskIdx] = useState(0)
  const [subMap, setSubMap] = useState({})
  const [tab, setTab] = useState('manual')

  const [code, setCode] = useState('')
  const [running, setRunning] = useState(false)
  const [runOutput, setRunOutput] = useState('')
  const [runResult, setRunResult] = useState(null)
  const [autoPass, setAutoPass] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)

  const autoSaveTimer = useRef(null)

  useEffect(() => {
    if (!id || !profile) return
    const load = async () => {
      setLoading(true); setErr(null)
      try {
        const { manual: m, tasks: ts } = await getManualForStudentWorkspace(id)
        const subs = await listStudentSubmissionsForManual(m.id, profile.id)
        setManual(m)
        setTasks(ts)
        setSubMap(subs)
        setPdfUrl(m.manual_pdf_url || null)
        const firstUndone = ts.findIndex((t) => {
          const s = subs[t.id]
          return !s || !['submitted', 'graded'].includes(s.status)
        })
        setTaskIdx(firstUndone === -1 ? Math.max(0, ts.length - 1) : firstUndone)
      } catch (e) {
        setErr(e.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, profile?.id])

  const task = tasks[taskIdx]
  const sub = task ? subMap[task?.id] : null
  const codeRef = useRef(code)
  codeRef.current = code

  // Populate editor code when task/load changes: use submission.code → submission.draft_code → task.starter_code
  useEffect(() => {
    if (!task) return
    const s = subMap[task.id]
    const initial = s?.code || s?.draft_code || task.starter_code || ''
    setCode(initial)
    setRunOutput('')
    setRunResult(null)
    setAutoPass(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id])

  // Auto-save draft code debounce
  useEffect(() => {
    if (!task || !manual || !profile) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      saveDraftSilent()
    }, 900)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, task?.id])

  const saveDraftSilent = async () => {
    if (!task || !manual || !profile) return
    try {
      const payload = {
        task_id: task.id,
        student_id: profile.id,
        manual_id: manual.id,
        draft_code: codeRef.current || '',
        code: subMap[task.id]?.code || codeRef.current || '',
        status: subMap[task.id]?.status || (codeRef.current ? 'in_progress' : 'not_started'),
      }
      const row = await upsertTaskSubmission(payload)
      setSubMap((prev) => ({ ...prev, [task.id]: row }))
    } catch (e) {
      // non-fatal for auto-save
    }
  }

  const canGoNext = useMemo(() => {
    if (taskIdx >= tasks.length - 1) return false
    const prev = tasks[taskIdx]
    if (!prev) return true
    const s = subMap[prev.id]
    if (!s) return false
    // Progression lock: must have Run (auto_passed===true OR status submitted/graded OR at least code draft)
    return !!s.code || ['submitted', 'graded', 'in_progress'].includes(s.status)
  }, [tasks, subMap, taskIdx])

  const setPageJump = (start, end) => {
    setTab('manual')
    if (!manual?.manual_pdf_url) return
    setPdfUrl(pageParam(manual.manual_pdf_url, start, end))
  }

  const doRun = async () => {
    if (!task || running) return
    setRunning(true); setRunOutput('Running…'); setRunResult(null); setAutoPass(null)
    try {
      const result = await runCode({
        code,
        language: task.language === 'javascript' ? 'javascript' : 'python',
        expectedOutput: task.expected_output || null,
        timeoutMs: 20000,
      })
      setRunResult(result)
      const rawOut = result.output || ''
      const displayOut = rawOut.trim() === ''
        ? (result.ok ? 'Ran successfully. (No output — use print() to see values.)' : '')
        : rawOut
      setRunOutput(displayOut)
      setAutoPass(result.passed)
      if (typeof result.passed === 'boolean' || result.ok) {
        try {
          const row = await upsertTaskSubmission({
            task_id: task.id, student_id: profile.id, manual_id: manual.id,
            code, draft_code: code, run_output: rawOut,
            auto_passed: typeof result.passed === 'boolean' ? result.passed : null,
            status: subMap[task.id]?.status || (code ? 'in_progress' : 'not_started'),
          })
          setSubMap((prev) => ({ ...prev, [task.id]: row }))
        } catch (_) {}
      }
    } catch (e) {
      setRunOutput('[run failed] ' + (e.message || String(e)))
    } finally {
      setRunning(false)
    }
  }

  const doSubmit = async () => {
    if (!task || !profile || !manual) return
    setSaving(true); setSaveMsg(null)
    try {
      let nextRunOutput = runOutput
      let nextAutoPass = autoPass
      let nextStatus = 'submitted'
      let nextGrade = null

      if (task.expected_output) {
        const result = await runCode({
          code,
          language: task.language === 'javascript' ? 'javascript' : 'python',
          expectedOutput: task.expected_output || null,
          timeoutMs: 20000,
        })
        const rawOut = result.output || ''
        const displayOut = rawOut.trim() === ''
          ? (result.ok ? 'Ran successfully. (No output — use print() to see values.)' : '')
          : rawOut
        setRunResult(result)
        setRunOutput(displayOut)
        setAutoPass(result.passed)

        nextRunOutput = rawOut
        nextAutoPass = result.passed
        if (result.passed === true) {
          nextStatus = 'graded'
          nextGrade = Number(task.points || 0)
        } else if (result.passed === false) {
          nextStatus = 'submitted'
          nextGrade = 0
        } else {
          nextStatus = 'submitted'
          nextGrade = null
        }
      }

      const row = await upsertTaskSubmission({
        task_id: task.id,
        student_id: profile.id,
        manual_id: manual.id,
        code,
        draft_code: code,
        status: nextStatus,
        run_output: nextRunOutput,
        auto_passed: nextAutoPass,
        grade: nextGrade,
        submitted_at: new Date().toISOString(),
      })
      setSubMap((prev) => ({ ...prev, [task.id]: row }))
      setSaveMsg({ type: 'success', text: `Task ${task.order_index} submitted.` })
      setTimeout(() => setSaveMsg(null), 2500)
    } catch (e) {
      setSaveMsg({ type: 'error', text: e.message || String(e) })
    } finally {
      setSaving(false)
    }
  }

  const karrasChip = (
    <a href="/" className="karras-chip" title="Back to KARRAS platform">
      <img src="/vl/k-logo.svg" alt="" width="14" height="14" style={{ display: 'block' }} />
      KARRAS
    </a>
  )

  if (loading && !manual) return <div className="page"><div className="card"><p className="muted text-center">Loading…</p></div></div>
  if (err) return <div className="page"><div className="card"><div className="error">{err}</div><Link to="/student" className="back-link">← Back</Link></div></div>
  if (!manual) return <div className="page"><div className="card"><p className="text-center mb-0">Manual not available.</p><Link to="/student" className="back-link">← Back</Link></div></div>

  const overallPct = tasks.length
    ? Math.round(tasks.reduce((a, t) => a + (['submitted','graded'].includes(subMap[t.id]?.status) ? 1 : 0), 0) / tasks.length * 100)
    : 0

  return (
    <div className="workspace-root">
      <div className="topbar workspace-topbar">
        <div style={{ minWidth: 0 }}>
          <Link to="/student" className="back-link" style={{ marginBottom: 8, display: 'inline-block' }}>← My manuals</Link>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="course-chip">{manual.course_code}</span>
            <h1 style={{ margin: 0, fontSize: 20 }}>{manual.title}</h1>
          </div>
          <div className="subtitle" style={{ marginTop: 4 }}>
            {manual.semester ? `${manual.semester} · ` : ''}
            Due: {fmt(manual.deadline)}
            <span style={{ marginLeft: 10 }}>{overallPct}% complete</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {karrasChip}
        </div>
      </div>

      <div className="workspace-progress-bar">
        <div className="progress-bar"><div className="progress-fill" style={{ width: overallPct + '%' }} /></div>
      </div>

      <div className="workspace-body">
        <div className={'workspace-pane pane-manual' + (tab === 'manual' ? ' pane-active' : '')}>
          <div className="pane-tabs mobile-only">
            <button className={'tab sm' + (tab === 'manual' ? ' tab-active' : '')} onClick={() => setTab('manual')}>📖 Manual</button>
            <button className={'tab sm' + (tab === 'task' ? ' tab-active' : '')} onClick={() => setTab('task')}>💻 Task</button>
          </div>
          <div className="pane-header desktop-only">
            <div className="row">
              <h2 className="mb-0">Manual</h2>
              <span className="small muted">{pdfUrl ? 'Embedded PDF viewer — tasks include direct page jumps.' : 'No PDF attached yet.'}</span>
            </div>
            {task && (
              <div className="pane-header-actions">
                {task.pdf_section_label ? (
                  <span className="task-section-chip">📚 {task.pdf_section_label}
                    {(task.pdf_page_start || task.pdf_page_end) &&
                      <span className="muted small" style={{ marginLeft: 6 }}>
                        pp. {task.pdf_page_start ?? '?'}–{task.pdf_page_end ?? task.pdf_page_start ?? '?'}
                      </span>
                    }
                  </span>
                ) : null}
                {(task.pdf_page_start || task.pdf_page_end) && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setPageJump(task.pdf_page_start, task.pdf_page_end)}>
                    Jump to pages in manual
                  </button>
                )}
              </div>
            )}
          </div>
          {pdfUrl ? (
            <iframe
              key={pdfUrl}
              className="pdf-frame"
              title="Manual PDF"
              src={pdfUrl}
              referrerPolicy="no-referrer"
              loading="eager"
            />
          ) : (
            <div className="pdf-viewer-card" style={{ margin: 12, padding: 18 }}>
              <div className="row" style={{ alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <h2 className="mb-0" style={{ fontSize: '1.05rem' }}>📖 Printed lab manual (page view)</h2>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Lecturer hasn&apos;t uploaded a PDF yet. This pane mirrors the layout of your printed manual so you can follow along with your physical copy or department handout.
                  </div>
                </div>
                {task && (task.pdf_page_start || task.pdf_section_label) && (
                  <span className="task-section-chip" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    📚 {task.pdf_section_label || 'Task section'}
                    {(task.pdf_page_start || task.pdf_page_end) && (
                      <span className="muted small" style={{ marginLeft: 6 }}>
                        pp. {task.pdf_page_start ?? '?'}–{task.pdf_page_end ?? task.pdf_page_start ?? '?'}
                      </span>
                    )}
                  </span>
                )}
              </div>
              {task && (
                <div style={{ marginTop: 10 }}>
                  <div className="small muted">Task reference:</div>
                  <h3 style={{ fontFamily: 'var(--font-display)', margin: '6px 0 8px', fontSize: '1rem' }}>
                    {String(task.order_index).padStart(2, '0')}. {task.title}
                  </h3>
                  {task.instruction_text && (
                    <p className="small" style={{ whiteSpace: 'pre-wrap', color: '#d4d4d8' }}>
                      {task.instruction_text.length > 340 ? task.instruction_text.slice(0, 340) + '…' : task.instruction_text}
                    </p>
                  )}
                  <div style={{ marginTop: 12 }} className="small muted">
                    Open your manual {task.pdf_section_label ? `(${task.pdf_section_label}) ` : ' '}
                    on page <strong style={{ color: 'var(--text)' }}>{task.pdf_page_start ?? '—'}</strong>
                    {task.pdf_page_end ? `–${task.pdf_page_end}` : ''}. Read the examples, diagrams, and edge cases there first — then attempt the task on the right pane.
                  </div>
                </div>
              )}
              <div className="small muted" style={{ marginTop: 14 }}>
                For actual PDF upload: Lecturer dashboard → Open manual → Settings tab → Upload/replace manual PDF.
              </div>
            </div>
          )}
        </div>

        <div className={'workspace-pane pane-task' + (tab === 'task' ? ' pane-active' : '')}>
          <div className="task-stepper">
            {tasks.map((t, idx) => {
              const s = subMap[t.id]
              const done = s && ['submitted', 'graded'].includes(s.status)
              const graded = s?.status === 'graded'
              return (
                <button
                  key={t.id}
                  type="button"
                  className={'stepper-dot' + (taskIdx === idx ? ' active' : '') + (graded ? ' graded' : done ? ' done' : '')}
                  onClick={() => setTaskIdx(idx)}
                  title={`Task ${t.order_index}${t.title ? `: ${t.title}` : ''}`}
                >
                  <span>{t.order_index ?? idx + 1}</span>
                </button>
              )
            })}
          </div>

          {saveMsg && <div className={saveMsg.type === 'error' ? 'error' : 'success'} style={{ marginBottom: 12 }}>{saveMsg.text}</div>}

          {task && (
            <div className="task-card">
              <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className="task-order-pill">#{task.order_index}</span>
                    <h2 className="mb-0" style={{ fontSize: 18 }}>{task.title}</h2>
                    {badgeFromStatus(sub?.status || 'not_started')}
                    {autoPass === true && <span className="badge badge-graded" title="Expected output match">Run passed</span>}
                    {autoPass === false && <span className="badge badge-submitted" title="Expected output mismatch">Run without match</span>}
                  </div>
                  {task.instruction_text && (
                    <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }} className="small">{task.instruction_text}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="small muted">{task.language === 'javascript' ? 'JavaScript' : 'Python'}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setTaskIdx(Math.max(0, taskIdx - 1))} disabled={taskIdx === 0}>← Prev</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setTaskIdx(Math.min(tasks.length - 1, taskIdx + 1))} disabled={taskIdx === tasks.length - 1 || !canGoNext}>
                    Next →
                  </button>
                </div>
              </div>
              {task.pdf_section_label && (
                <div className="pane-header-actions mobile-only" style={{ marginTop: 10 }}>
                  <span className="task-section-chip">📚 {task.pdf_section_label}
                    {(task.pdf_page_start || task.pdf_page_end) &&
                      <span className="muted small" style={{ marginLeft: 6 }}>
                        pp. {task.pdf_page_start ?? '?'}–{task.pdf_page_end ?? task.pdf_page_start ?? '?'}
                      </span>
                    }
                  </span>
                  {(task.pdf_page_start || task.pdf_page_end) && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setPageJump(task.pdf_page_start, task.pdf_page_end)}>
                      Jump to section in manual
                    </button>
                  )}
                </div>
              )}

              <div style={{ height: 14 }} />

              <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-sm" onClick={doRun} disabled={running}>
                  {running ? 'Running…' : '▶ Run'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => {
                  if (window.confirm('Reset editor to starter code? Unsaved draft will be lost.')) {
                    setCode(task.starter_code || '')
                    setRunOutput('')
                    setRunResult(null)
                    setAutoPass(null)
                  }
                }}>Reset starter</button>
                <span className="small muted">Auto-saves draft as you type.</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm" onClick={doSubmit} disabled={saving}>
                    {saving ? 'Submitting…' : 'Submit for grading'}
                  </button>
                </div>
              </div>

              <div style={{ height: 12 }} />
              <CodeEditor
                value={code}
                onChange={setCode}
                language={task.language === 'javascript' ? 'javascript' : 'python'}
                mobile={true}
                height="52vh"
              />

              <div style={{ height: 14 }} />
              <div className="row" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                <h3 className="mb-0" style={{ fontSize: 14 }}>Run output</h3>
                {typeof autoPass === 'boolean' && (
                  <span className={'small ' + (autoPass ? 'success-inline' : 'warn-inline')}>
                    {autoPass ? 'Matches expected output.' : 'Does not match expected output.'}
                  </span>
                )}
                {task.expected_output && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setTab('expected')}>
                    Show expected output
                  </button>
                )}
              </div>
              {tab === 'expected' && task.expected_output && (
                <pre className="code-block code-block-expected" style={{ marginTop: 10 }}>{task.expected_output}</pre>
              )}
              <pre className="code-block" style={{ minHeight: 80, marginTop: 10 }}>
                {runOutput || '(no output yet — click Run)'}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
