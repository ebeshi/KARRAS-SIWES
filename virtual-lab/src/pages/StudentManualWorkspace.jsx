import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import {
  getManualForStudentWorkspace, listStudentSubmissionsForManual,
  upsertTaskSubmission,
} from '../lib/manualsQueries.js'
import { runCode } from '../lib/runCode.js'
import CodeEditor from '../components/CodeEditor.jsx'
import ManualPdfViewer from '../components/ManualPdfViewer.jsx'
import { normalizeTaskLanguage, TASK_LANGUAGES } from '../lib/languages.js'

const fmt = (iso) => { try { return new Date(iso).toLocaleString() } catch { return iso } }
const deadlineTime = (value) => {
  if (!value) return NaN
  const normalized = typeof value === 'string' && !value.includes('T')
    ? `${value.replace(' ', 'T')}Z`
    : value
  return new Date(normalized).getTime()
}

const isTaskCompleted = (submission) => (
  Boolean(submission && (submission.auto_passed === 1 || submission.auto_passed === true) && ['submitted', 'graded'].includes(submission.status))
)

const pageParam = (url, start, end) => {
  if (!url) return null
  const hash = start != null ? `page=${start}` : null
  if (!hash) return url
  const sep = url.includes('#') ? '&' : '#'
  return url + sep + hash
}

const badgeFromStatus = (submission) => {
  if (isTaskCompleted(submission)) return <span className="badge badge-graded">✓ Completed</span>
  if (submission?.status === 'submitted' || submission?.status === 'graded') return <span className="badge badge-notstarted">Not completed</span>
  if (submission?.status === 'in_progress') return <span className="badge badge-notstarted">Draft</span>
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
  const [pane, setPane] = useState('manual')
  const [topBarHidden, setTopBarHidden] = useState(false)

  const [code, setCode] = useState('')
  const [runConfirmation, setRunConfirmation] = useState(null)
  const [running, setRunning] = useState(false)
  const [runOutput, setRunOutput] = useState('')
  const [runResult, setRunResult] = useState(null)
  const [previewHtml, setPreviewHtml] = useState(null)
  const [autoPass, setAutoPass] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [deadlineElapsed, setDeadlineElapsed] = useState(false)

  const autoSaveTimer = useRef(null)
  const draftsRef = useRef({})

  useEffect(() => {
    if (!id || !profile) return
    const load = async () => {
      setLoading(true); setErr(null)
      try {
        const { manual: m, tasks: ts } = await getManualForStudentWorkspace(id)
        const subs = await listStudentSubmissionsForManual(m.id, profile.id)
        for (const item of ts) {
          draftsRef.current[item.id] = subs[item.id]?.draft_code || subs[item.id]?.code || item.starter_code || ''
        }
        setManual(m)
        setTasks(ts)
        setSubMap(subs)
        setPdfUrl(m.manual_pdf_url || null)
        const firstUndone = ts.findIndex((t) => {
          const s = subs[t.id]
          return !isTaskCompleted(s)
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

  useEffect(() => {
    const deadline = deadlineTime(manual?.deadline)
    if (!Number.isFinite(deadline)) return
    setDeadlineElapsed(false)
    let timer
    const updateDeadlineState = () => {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        setDeadlineElapsed(true)
        return
      }
      timer = window.setTimeout(updateDeadlineState, Math.min(remaining, 2147483647))
    }
    updateDeadlineState()
    return () => window.clearTimeout(timer)
  }, [manual?.deadline])

  const task = tasks[taskIdx]
  const sub = task ? subMap[task?.id] : null
  const codeRef = useRef(code)
  codeRef.current = code

  const saveDraft = async (targetTask, draftCode) => {
    if (!targetTask || !manual || !profile || isTaskCompleted(subMap[targetTask.id])) return
    const row = await upsertTaskSubmission({
      task_id: targetTask.id,
      student_id: profile.id,
      manual_id: manual.id,
      draft_code: draftCode,
      code: draftCode,
      auto_passed: null,
      status: draftCode ? 'in_progress' : 'not_started',
    })
    setSubMap((prev) => ({ ...prev, [targetTask.id]: row }))
  }

  const selectTask = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= tasks.length || nextIndex === taskIdx) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    if (task && !isTaskCompleted(subMap[task.id])) {
      saveDraft(task, code).catch((e) => {
        setSaveMsg({ type: 'error', text: `Could not save draft: ${e.message || String(e)}` })
      })
    }
    const nextTask = tasks[nextIndex]
    const nextCode = draftsRef.current[nextTask.id] ?? subMap[nextTask.id]?.draft_code ?? subMap[nextTask.id]?.code ?? nextTask.starter_code ?? ''
    codeRef.current = nextCode
    setCode(nextCode)
    setTaskIdx(nextIndex)
    setRunConfirmation(null)
    setRunResult(null)
    setAutoPass(null)
  }

  const handleCodeChange = (nextCode) => {
    codeRef.current = nextCode
    if (task) draftsRef.current[task.id] = nextCode
    setCode(nextCode)
    setRunConfirmation(null)
    setRunResult(null)
    setAutoPass(null)
  }

  // Populate editor code when task/load changes: use submission.code → submission.draft_code → task.starter_code
  useEffect(() => {
    if (!task) return
    const s = subMap[task.id]
    const initial = draftsRef.current[task.id] ?? s?.draft_code ?? s?.code ?? task.starter_code ?? ''
    setCode(initial)
    codeRef.current = initial
    setRunConfirmation(null)
    setRunOutput('')
    setRunResult(null)
    setPreviewHtml(null)
    setAutoPass(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id])

  // Debounce saves while editing. Task navigation flushes the pending save first.
  useEffect(() => {
    if (!task || !manual || !profile) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    const taskToSave = task
    const codeToSave = code
    autoSaveTimer.current = setTimeout(() => {
      saveDraft(taskToSave, codeToSave).catch((e) => {
        setSaveMsg({ type: 'error', text: `Could not save draft: ${e.message || String(e)}` })
      })
    }, 900)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, task?.id])

  const setPageJump = (start, end) => {
    setPane('manual')
    if (!manual?.manual_pdf_url) return
    setPdfUrl(pageParam(manual.manual_pdf_url, start, end))
  }

  const doRun = async () => {
    if (!task || running || deadlineElapsed || isTaskCompleted(subMap[task.id])) return
    if (!code.trim()) {
      setRunConfirmation(null)
      setAutoPass(false)
      setRunOutput('Enter code before running this task.')
      return
    }
    setRunConfirmation(null)
    setRunning(true); setRunOutput('Running…'); setRunResult(null); setPreviewHtml(null); setAutoPass(null)
    try {
      const result = await runCode({
        code,
        language: normalizeTaskLanguage(task.language),
        expectedOutput: task.expected_output || null,
        timeoutMs: 20000,
      })
      setRunResult(result)
      setPreviewHtml(result.previewHtml || null)
      const rawOut = result.output || ''
      const displayOut = rawOut.trim() === ''
        ? (result.ok ? 'Ran successfully. (No output — use print() to see values.)' : '')
        : rawOut
      setRunOutput(displayOut)
      setAutoPass(result.passed)
      const isPass = result.ok && result.passed === true
      if (isPass) {
        setRunConfirmation({ taskId: task.id, code, output: rawOut })
      }
      if (typeof result.passed === 'boolean' || result.ok) {
        try {
          const row = await upsertTaskSubmission({
            task_id: task.id,
            student_id: profile.id,
            manual_id: manual.id,
            code,
            draft_code: code,
            run_output: rawOut,
            auto_passed: isPass ? true : (typeof result.passed === 'boolean' ? result.passed : null),
            status: isPass ? 'submitted' : (code ? 'in_progress' : 'not_started'),
            submitted_at: isPass ? new Date().toISOString() : undefined,
          })
          const updatedRow = {
            ...row,
            auto_passed: isPass ? true : (row?.auto_passed === 1 || row?.auto_passed === true),
            status: isPass ? 'submitted' : (row?.status || 'in_progress'),
          }
          setSubMap((prev) => ({ ...prev, [task.id]: updatedRow }))
          if (isPass) {
            setSaveMsg({ type: 'success', text: `Task ${task.order_index} passed and completed! ✓` })
            setTimeout(() => setSaveMsg(null), 3000)
          }
        } catch (e) {
          setSaveMsg({ type: 'error', text: `Could not save run result: ${e.message || String(e)}` })
        }
      }
    } catch (e) {
      setRunOutput('[run failed] ' + (e.message || String(e)))
    } finally {
      setRunning(false)
    }
  }

  const doSubmit = async () => {
    if (!task || !profile || !manual) return
    if (deadlineElapsed) {
      setSaveMsg({ type: 'error', text: 'The submission deadline has passed.' })
      return
    }
    if (!code.trim()) {
      setSaveMsg({ type: 'error', text: 'Enter an answer before submitting.' })
      return
    }
    if (!task.expected_output?.trim() || ['html', 'css'].includes(task.language)) {
      setSaveMsg({ type: 'error', text: 'This task cannot be auto-checked yet. Ask your lecturer to add an expected output and use an executable language.' })
      return
    }
    if (isTaskCompleted(subMap[task.id])) return
    if (runConfirmation?.taskId !== task.id || runConfirmation.code !== code) {
      setSaveMsg({ type: 'error', text: 'Run this exact code and confirm it produces the correct output before submitting.' })
      return
    }
    setSaving(true); setSaveMsg(null)
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    try {
      const row = await upsertTaskSubmission({
        task_id: task.id,
        student_id: profile.id,
        manual_id: manual.id,
        code,
        draft_code: code,
        status: 'submitted',
        run_output: runConfirmation?.output || runOutput,
        auto_passed: true,
        submitted_at: new Date().toISOString(),
      })
      const updatedRow = {
        ...row,
        auto_passed: true,
        status: 'submitted',
      }
      setSubMap((prev) => ({ ...prev, [task.id]: updatedRow }))
      setSaveMsg({ type: 'success', text: `Task ${task.order_index} completed! ✓` })
      setTimeout(() => setSaveMsg(null), 2500)
    } catch (e) {
      setSaveMsg({ type: 'error', text: e.message || String(e) })
    } finally {
      setSaving(false)
    }
  }

  const karrasChip = (
    <a href="/" className="karras-chip" title="Back to KARRAS platform">
      <img src="/k-logo.svg" alt="" width="14" height="14" style={{ display: 'block' }} />
      KARRAS
    </a>
  )

  if (loading && !manual) return <div className="page"><div className="card"><p className="muted text-center">Loading…</p></div></div>
  if (err) return <div className="page"><div className="card"><div className="error">{err}</div><Link to="/student" className="back-link">← Back</Link></div></div>
  if (!manual) return <div className="page"><div className="card"><p className="text-center mb-0">Manual not available.</p><Link to="/student" className="back-link">← Back</Link></div></div>

  const completedTasks = tasks.filter((t) => isTaskCompleted(subMap[t.id])).length
  const isCompleted = tasks.length > 0 && completedTasks === tasks.length
  const overallPct = tasks.length
    ? Math.round(completedTasks / tasks.length * 100)
    : 0

  return (
    <div className={`workspace-root${topBarHidden ? ' topbar-hidden' : ''}`}>
      {!topBarHidden && (
        <div className="topbar workspace-topbar">
          <div id="workspace-manual-details" style={{ minWidth: 0 }}>
            <Link to="/student" className="back-link" style={{ marginBottom: 8, display: 'inline-block' }}>← My manuals</Link>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="course-chip">{manual.course_code}</span>
              <h1 style={{ margin: 0, fontSize: 20 }}>{manual.title}</h1>
            </div>
            <div className="subtitle" style={{ marginTop: 4 }}>
              {manual.semester ? `${manual.semester} · ` : ''}
              Due: {fmt(manual.deadline)}
              <span style={{ marginLeft: 10 }}>{completedTasks}/{tasks.length} tasks completed</span>
              <span style={{ marginLeft: 10 }}>
                {isCompleted ? 'Completed · Score: 40/40' : deadlineElapsed ? 'Incomplete · Score: 0/40' : 'In progress'}
              </span>
            </div>
          </div>
          <div className="workspace-header-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              title="Hide top bar to maximize PDF and workspace area"
              onClick={() => setTopBarHidden(true)}
            >
              ▲ Hide top bar
            </button>
            {karrasChip}
          </div>
        </div>
      )}

      <div className="workspace-progress-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="progress-bar" style={{ flex: 1 }}>
            <div className="progress-fill" style={{ width: overallPct + '%' }} />
          </div>
          {topBarHidden ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <Link to="/student" className="back-link" style={{ padding: '2px 8px', fontSize: '0.78rem', minHeight: 'auto' }}>← Manuals</Link>
              <span className="small muted" style={{ fontSize: '0.8rem' }}>{completedTasks}/{tasks.length} done ({overallPct}%)</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '2px 8px', fontSize: '0.78rem', minHeight: 'auto' }}
                onClick={() => setTopBarHidden(false)}
              >
                ▼ Show top bar
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {deadlineElapsed && !isCompleted && (
        <div className="error" style={{ margin: '12px 18px' }}>
          The submission deadline has elapsed. Your manual is recorded as incomplete ({completedTasks}/{tasks.length} tasks completed).
        </div>
      )}

      <div className="workspace-mobile-tabs mobile-only">
        <button className={'tab sm' + (pane === 'manual' ? ' tab-active' : '')} onClick={() => setPane('manual')}>📖 Manual</button>
        <button className={'tab sm' + (pane === 'task' ? ' tab-active' : '')} onClick={() => setPane('task')}>💻 Task</button>
      </div>

      <div className="workspace-body">
        <div className={'workspace-pane pane-manual' + (pane === 'manual' ? ' pane-active' : '')}>
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
            <ManualPdfViewer
              url={pdfUrl}
              allowDownload
              downloadName={manual.title}
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

        <div className={'workspace-pane pane-task' + (pane === 'task' ? ' pane-active' : '')}>
          <div className="task-stepper">
            {tasks.map((t, idx) => {
              const s = subMap[t.id]
              const done = isTaskCompleted(s)
              return (
                <button
                  key={t.id}
                  type="button"
                  className={'stepper-dot' + (taskIdx === idx ? ' active' : '') + (done ? ' done' : '')}
                  onClick={() => selectTask(idx)}
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
                    {badgeFromStatus(sub)}
                    {autoPass === true && <span className="badge badge-graded" title="Expected output match">Run passed</span>}
                    {autoPass === false && <span className="badge badge-submitted" title="Expected output mismatch">Run without match</span>}
                  </div>
                  {task.instruction_text && (
                    <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }} className="small">{task.instruction_text}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="small muted">
                    {TASK_LANGUAGES.find(({ value }) => value === normalizeTaskLanguage(task.language))?.label || 'Python'}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => selectTask(taskIdx - 1)} disabled={taskIdx === 0}>← Prev</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => selectTask(taskIdx + 1)} disabled={taskIdx === tasks.length - 1}>
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

              <div className="task-actions">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button className="btn btn-sm" onClick={doRun} disabled={running || deadlineElapsed || isTaskCompleted(sub)}>
                      {running ? 'Running…' : '▶ Run'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => {
                      if (window.confirm('Reset editor to starter code? Unsaved draft will be lost.')) {
                        setCode(task.starter_code || '')
                        setRunOutput('')
                        setRunResult(null)
                        setPreviewHtml(null)
                        setAutoPass(null)
                      }
                    }}>Reset</button>
                  </div>
                  <span className="small muted desktop-only">Auto-saves draft as you type.</span>
                  <div style={{ marginLeft: 'auto' }}>
                    <button className="btn btn-sm" onClick={doSubmit} disabled={saving || deadlineElapsed || isTaskCompleted(sub)}>
                      {saving ? 'Checking…' : isTaskCompleted(sub) ? '✓ Completed' : 'Submit correct answer'}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ height: 12 }} />
              <CodeEditor
                value={code}
                onChange={handleCodeChange}
                language={normalizeTaskLanguage(task.language)}
                mobile={true}
                height="60dvh"
                readOnly={deadlineElapsed || isTaskCompleted(sub)}
              />

              <div style={{ height: 14 }} />
              <div className="row" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                <h3 className="mb-0" style={{ fontSize: 14 }}>Run output</h3>
                {typeof autoPass === 'boolean' && (
                  <span className={'small ' + (autoPass ? 'success-inline' : 'warn-inline')}>
                    {autoPass ? 'Matches expected output.' : 'Does not match expected output.'}
                  </span>
                )}
              </div>
              {previewHtml !== null && (
                <iframe
                  title="Code preview"
                  sandbox=""
                  srcDoc={previewHtml}
                  style={{
                    display: 'block',
                    width: '100%',
                    minHeight: 280,
                    marginTop: 10,
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12,
                    background: '#fff',
                  }}
                />
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
