import { useEffect, useState, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import CodeEditor from '../components/CodeEditor.jsx'

const PISTON_URL = 'https://emkc.org/api/v2/piston/execute'

// --- In-browser fallback runners ------------------------------------------------
// Piston public API became whitelist-only (Feb 2026). When it 401s, we still need
// the Run Code button to actually run code for the hackathon demo. These fallbacks
// are ADDITIVE: no UI or flow changes, stdout/stderr shapes are identical.

function runJavaScriptSandboxed(code, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const logs = []
    const errors = []
    let exited = false
    let exitCode = 0

    const myConsole = {
      log: (...args) => logs.push(args.map(stringify).join(' ')),
      info: (...args) => logs.push(args.map(stringify).join(' ')),
      warn: (...args) => errors.push('WARN ' + args.map(stringify).join(' ')),
      error: (...args) => errors.push('ERROR ' + args.map(stringify).join(' ')),
    }

    function stringify(v) {
      if (v === undefined) return 'undefined'
      if (typeof v === 'string') return v
      try { return JSON.stringify(v) } catch { return String(v) }
    }

    const timer = setTimeout(() => {
      if (exited) return
      exited = true
      exitCode = -1
      errors.push('Timed out after ' + (timeoutMs / 1000) + 's')
      resolve({ stdout: logs.join('\n') + (logs.length ? '\n' : ''), stderr: errors.join('\n') + (errors.length ? '\n' : ''), code: exitCode })
    }, timeoutMs)

    try {
      const wrapped = '(function(console) { "use strict"; ' + code + '\n })'
      // eslint-disable-next-line no-new-func
      const fn = (new Function(wrapped + '; return ' + wrapped + ';'))()
      fn(myConsole)
    } catch (err) {
      exitCode = 1
      errors.push(err && err.stack ? String(err.stack) : String(err))
    }

    if (!exited) {
      clearTimeout(timer)
      exited = true
      resolve({
        stdout: logs.length ? logs.join('\n') + '\n' : '',
        stderr: errors.length ? errors.join('\n') + '\n' : '',
        code: exitCode,
      })
    }
  })
}

// Singleton Pyodide loader. Reuse one runtime across runs (faster), boot it once.
let pyodideBoot = null
const PYODIDE_VERSION = '0.26.4'
async function ensurePyodide() {
  if (pyodideBoot) return pyodideBoot
  // Load Pyodide from the pinned CDN release. We load via <script> to avoid
  // Vite resolving the npm package's `node:` imports, and to ensure the loader
  // fetches its WASM files from the exact-matching CDN directory.
  pyodideBoot = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('No window'))
    if (window.loadPyodide) return resolve(window.loadPyodide)
    const s = document.createElement('script')
    s.src = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`
    s.crossOrigin = 'anonymous'
    s.onload = () => resolve(window.loadPyodide)
    s.onerror = () => reject(new Error(`Failed to load Pyodide ${PYODIDE_VERSION}`))
    document.head.appendChild(s)
  }).then(async (loadPyodide) => {
    const py = await loadPyodide({
      indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
    })
    // Redirect Python's stdout/stderr to our buffers.
    py.setStdout({ batched: (s) => { py._stdoutBuf = (py._stdoutBuf || '') + s } })
    py.setStderr({ batched: (s) => { py._stderrBuf = (py._stderrBuf || '') + s } })
    return py
  })
  return pyodideBoot
}

async function runPythonSandboxed(code, timeoutMs = 6000) {
  const stdoutBuf = []
  const stderrBuf = []
  let exitCode = 0
  let timedOut = false
  try {
    const py = await ensurePyodide()
    py._stdoutBuf = ''
    py._stderrBuf = ''

    // Without SharedArrayBuffer we cannot safely interrupt a tight infinite loop in
    // Python, so we race the run against a timeout and surface a timeout error to
    // the student. This is sufficient for the demo scope.
    const timeoutP = new Promise((resolve) => {
      setTimeout(() => {
        timedOut = true
        resolve({ timedOut: true })
      }, timeoutMs)
    })
    const runP = (async () => {
      try {
        await py.runPythonAsync(code)
        return { timedOut: false }
      } catch (err) {
        return { timedOut: false, err }
      }
    })()

    const result = await Promise.race([timeoutP, runP])
    if (result.timedOut) {
      exitCode = -1
      stderrBuf.push('Timed out after ' + (timeoutMs / 1000) + 's (Python loops cannot be interrupted in this build — keep runs < ' + (timeoutMs / 1000) + 's).\n')
    } else if (result.err) {
      exitCode = 1
      const err = result.err
      const msg = (err && err.message) ? String(err.message) : String(err)
      if (msg && msg !== 'undefined') {
        stderrBuf.push(msg.endsWith('\n') ? msg : msg + '\n')
      }
    }

    if (py._stdoutBuf) stdoutBuf.push(py._stdoutBuf)
    if (py._stderrBuf) stderrBuf.push(py._stderrBuf)
  } catch (bootErr) {
    exitCode = 1
    stderrBuf.push('Python runner failed to start: ' + (bootErr && bootErr.message ? bootErr.message : String(bootErr)) + '\n')
  }
  return {
    stdout: stdoutBuf.join(''),
    stderr: stderrBuf.join(''),
    code: exitCode,
  }
}

function detectLanguage(code = '') {
  const s = code || ''
  if (/\b(import\s|from\s|export\s|console\.log|function\s|const\s|let\s|=>|\.py\b|def\s|print\(|class\s|java\.|public\s+class|System\.out\.println)/.test(s)) {
    if (/\b(def\s|print\(|import\s+re\b|import\s+os\b|from\s+typing\b)/.test(s)) {
      return { language: 'python', version: '3.10.0', runCmd: 'python3' }
    }
    if (/\b(public\s+class|System\.out\.println|import\s+java\.)/.test(s)) {
      return { language: 'java', version: '15.0.2', runCmd: 'java' }
    }
  }
  return { language: 'javascript', version: '18.15.0', runCmd: 'node' }
}

function buildPistonPayload(code, filename = 'solution') {
  const { language, version } = detectLanguage(code)
  const extension = language === 'python' ? 'py' : language === 'java' ? 'java' : 'js'
  return {
    language,
    version,
    files: [{ name: `${filename}.${extension}`, content: code || '' }],
    stdin: '',
    compile_timeout: 10000,
    run_timeout: 8000,
    compile_memory_limit: -1,
    run_memory_limit: -1,
  }
}

export default function StudentAssignmentDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [assignment, setAssignment] = useState(null)
  const [submission, setSubmission] = useState(null)
  const [code, setCode] = useState('// Write your solution here\n\n')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(true)

  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState(null)
  const [runResult, setRunResult] = useState(null) // { stdout, stderr, comparePass: true|false|null }
  const [lastAutoPassed, setLastAutoPassed] = useState(null) // the auto_passed value to save at submit time

  useEffect(() => {
    if (!id || !profile) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const { data: asgn, error: aErr } = await supabase
          .from('assignments')
          .select('id, title, description, deadline, expected_output, manual_pdf_url, created_at, users!assignments_instructor_id_fkey(full_name)')
          .eq('id', id)
          .single()
        if (aErr) throw aErr
        if (!cancelled) setAssignment(asgn)

        const { data: sub, error: sErr } = await supabase
          .from('submissions')
          .select('id, code, submitted_at, grade, feedback, status, auto_passed')
          .eq('assignment_id', id)
          .eq('student_id', profile.id)
          .maybeSingle()
        if (sErr) throw sErr
        if (!cancelled) {
          setSubmission(sub)
          if (sub?.code != null) setCode(sub.code)
        }
      } catch (err) {
        console.error(err)
        setError(err.message || 'Could not load assignment')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, profile])

  const deadlinePast = useMemo(() => {
    if (!assignment?.deadline) return false
    return new Date(assignment.deadline) < new Date()
  }, [assignment])

  const isGraded = submission?.status === 'graded'

  const runCode = async () => {
    if (!code || !code.trim()) {
      setRunError('Write some code first.')
      setRunResult(null)
      setLastAutoPassed(null)
      return
    }
    setRunning(true)
    setRunError(null)
    try {
      const detected = detectLanguage(code)
      const payload = buildPistonPayload(code, 'solution')
      let combinedStdout = ''
      let combinedStderr = ''
      let exitCode = 0
      let fellBack = false
      let pistonErrMsg = null

      try {
        const res = await fetch(PISTON_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const raw = await res.text()
        if (!res.ok) {
          throw new Error(`Runner returned ${res.status}.`)
        }
        let data = null
        try { data = JSON.parse(raw) } catch { throw new Error('Runner returned non-JSON.') }

        const stdout = typeof data?.run?.stdout === 'string' ? data.run.stdout : ''
        const stderr = typeof data?.run?.stderr === 'string' ? data.run.stderr : ''
        const compileOut = typeof data?.compile?.stdout === 'string' ? data.compile.stdout : ''
        const compileErr = typeof data?.compile?.stderr === 'string' ? data.compile.stderr : ''
        exitCode = typeof data?.run?.code === 'number' ? data.run.code : 0

        combinedStdout = compileOut + stdout
        combinedStderr = compileErr + stderr
      } catch (pistonErr) {
        pistonErrMsg = pistonErr.message || String(pistonErr)
        // Piston is unavailable — fall back to in-browser runners where possible.
        if (detected.language === 'javascript') {
          const local = await runJavaScriptSandboxed(code)
          combinedStdout = local.stdout || ''
          combinedStderr = local.stderr || ''
          exitCode = local.code || 0
          fellBack = 'javascript'
        } else if (detected.language === 'python') {
          const local = await runPythonSandboxed(code)
          combinedStdout = local.stdout || ''
          combinedStderr = local.stderr || ''
          exitCode = local.code || 0
          fellBack = 'python'
        } else {
          throw new Error(`${pistonErrMsg} (${detected.language} cannot run offline; try JavaScript or Python.)`)
        }
      }

      if (!combinedStderr && exitCode !== 0) {
        combinedStderr = `Process exited with code ${exitCode}.\n`
      }
      if (fellBack) {
        const label = fellBack === 'python' ? 'Python (Pyodide)' : 'JavaScript'
        const note = `[Note: Piston unavailable — running ${label} locally in browser. Output comparison still applies.]\n`
        combinedStdout = note + combinedStdout
      }

      let comparePass = null
      if (assignment?.expected_output != null && assignment.expected_output !== '') {
        // Compare raw stdout (stripping the fallback prefix, if any) against expected.
        const stdoutForCompare = combinedStdout.replace(/^\[Note:[^\]]*\]\s*\n/, '')
        comparePass = stdoutForCompare.trim() === String(assignment.expected_output).trim()
      }
      setRunResult({ stdout: combinedStdout, stderr: combinedStderr, comparePass, pistonUnavailable: fellBack ? (pistonErrMsg || 'unavailable') : null })
      setLastAutoPassed(comparePass)
    } catch (err) {
      console.error(err)
      setRunError(err.message || 'Run failed')
      setRunResult(null)
      setLastAutoPassed(null)
    } finally {
      setRunning(false)
    }
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!profile || !assignment) return
    setError(null)
    setSuccess(false)
    setSaving(true)
    try {
      let auto_passed = lastAutoPassed
      if (auto_passed == null && submission?.auto_passed != null) auto_passed = submission.auto_passed
      // Auto-grade immediately — no manual confirmation step:
      // auto_passed === true → grade=100, status='graded'
      // otherwise (false / not yet run / compare not-yet-happened → treated as fail) → grade=0, status='graded'
      const passed = auto_passed === true
      const grade = passed ? 100 : 0
      const status = 'graded'

      const { error: upsertErr } = await supabase
        .from('submissions')
        .upsert(
          {
            assignment_id: assignment.id,
            student_id: profile.id,
            code,
            submitted_at: new Date().toISOString(),
            status,
            grade,
            feedback: null,
            auto_passed,
          },
          { onConflict: 'assignment_id,student_id' }
        )
      if (upsertErr) throw upsertErr

      const { data: sub, error: sErr } = await supabase
        .from('submissions')
        .select('id, code, submitted_at, grade, feedback, status, auto_passed')
        .eq('assignment_id', assignment.id)
        .eq('student_id', profile.id)
        .single()
      if (sErr) throw sErr
      setSubmission(sub)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message || 'Submission failed')
    } finally {
      setSaving(false)
    }
  }

  const fmt = (iso) => {
    try { return new Date(iso).toLocaleString() } catch { return iso }
  }

  const compareBadge = () => {
    if (!runResult) return null
    if (runResult.comparePass === true) return <span className="badge badge-pass" style={{ marginLeft: 8 }}>PASS</span>
    if (runResult.comparePass === false) return <span className="badge badge-fail" style={{ marginLeft: 8 }}>FAIL</span>
    return null
  }

  if (loading && !assignment) {
    return <div className="page"><div className="card"><p className="text-center muted">Loading…</p></div></div>
  }

  if (!assignment) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-center mb-0">Assignment not found.</p>
          <div style={{ height: 12 }} />
          <Link to="/student" className="back-link">← Back to assignments</Link>
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

  return (
    <div>
      <div className="topbar">
        <div>
          <Link to="/student" className="back-link">← Back</Link>
        </div>
        {karrasChip}
      </div>
      <div className="page">
        <div className="card">
          <h2 className="mb-0">{assignment.title}</h2>
          <div className="list-item-meta" style={{ marginTop: 8 }}>
            <span>Instructor: {assignment.users?.full_name || '—'}</span>
          </div>
          <div className="list-item-meta">
            <span className={deadlinePast ? 'deadline-past' : ''}>
              {deadlinePast ? 'Closed · ' : 'Due: '}{fmt(assignment.deadline)}
            </span>
            {submission && (
              submission.status === 'graded'
                ? <span className="badge badge-graded">Graded</span>
                : <span className="badge badge-submitted">Submitted</span>
            )}
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
        </div>

        {isGraded && (
          <div className="grade-banner">
            <div className="grade-label">Grade</div>
            <div className="grade-value">{submission.grade ?? '—'}</div>
            <div className="small muted">Submitted: {fmt(submission.submitted_at)}</div>
            {submission.feedback && (
              <div className="feedback">{submission.feedback}</div>
            )}
          </div>
        )}

        {!isGraded && deadlinePast && submission?.status === 'submitted' && (
          <div className="success mb-lg">
            Deadline has passed. Your latest submission ({fmt(submission.submitted_at)}) is awaiting grading.
          </div>
        )}

        {!isGraded && (
          <>
            {error && <div className="error">{error}</div>}
            {success && <div className="success">Submission saved.</div>}

            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Your code</h3>
            {assignment?.manual_pdf_url && (
              <div className="manual-wrap" style={{ marginBottom: 14 }}>
                <div className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
                  <div className="small muted" style={{ fontWeight: 600 }}>
                    Assignment manual
                  </div>
                  <a
                    className="small"
                    style={{ marginLeft: 'auto' }}
                    href={assignment.manual_pdf_url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Open manual in new tab ↗
                  </a>
                </div>
                <iframe
                  title="Assignment manual"
                  src={assignment.manual_pdf_url}
                  className="manual-iframe"
                  style={{
                    width: '100%',
                    minHeight: 420,
                    height: '60vh',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    backgroundColor: '#fff',
                    display: 'block',
                  }}
                />
              </div>
            )}
            <div className="editor-wrap">
              <CodeEditor
                value={code}
                onChange={setCode}
                readOnly={deadlinePast && submission?.status === 'submitted'}
              />
            </div>

            <div className="stack-sm">
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={runCode}
                disabled={running || (deadlinePast && submission?.status === 'submitted')}
              >
                {running ? 'Running…' : 'Run Code'}
              </button>

              {runError && <div className="error">{runError}</div>}

              {(runResult || runError == null) && runResult && (
                <div className="run-output">
                  <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
                    <div className="small muted" style={{ fontWeight: 600 }}>
                      Output
                    </div>
                    {compareBadge()}
                    <div className="small muted" style={{ marginLeft: 'auto' }}>
                      {assignment?.expected_output != null && assignment.expected_output !== '' && runResult && runResult.comparePass == null ? '' : ''}
                    </div>
                  </div>
                  {runResult.stdout ? (
                    <pre className="code-block run-stdout" aria-label="stdout">{runResult.stdout}</pre>
                  ) : (
                    <div className="small muted" style={{ marginBottom: 8 }}>
                      (no stdout)
                    </div>
                  )}
                  {runResult.stderr ? (
                    <>
                      <div className="small muted" style={{ fontWeight: 600, marginTop: 10, marginBottom: 6 }}>
                        Errors / stderr
                      </div>
                      <pre className="code-block run-stderr" aria-label="stderr">{runResult.stderr}</pre>
                    </>
                  ) : null}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <button
                  type="submit"
                  className="btn btn-block"
                  disabled={saving || (deadlinePast && submission?.status === 'submitted')}
                >
                  {saving ? 'Submitting…' : submission ? 'Update submission' : 'Submit'}
                </button>
              </form>
              {submission?.submitted_at && !deadlinePast && (
                <p className="small muted text-center mt-lg mb-0">
                  Last submitted: {fmt(submission.submitted_at)}. You can update until the deadline.
                </p>
              )}
              {submission?.auto_passed != null && (
                <div className="small muted text-center mt-lg" style={{ marginTop: 8 }}>
                  Last saved submission auto-check:&nbsp;
                  {submission.auto_passed
                    ? <span className="badge badge-pass">PASS</span>
                    : <span className="badge badge-fail">FAIL</span>}
                </div>
              )}
            </div>
          </>
        )}

        {isGraded && submission?.code && (
          <>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Your submitted code</h3>
            <div className="editor-wrap">
              <CodeEditor value={submission.code} readOnly height="40vh" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
