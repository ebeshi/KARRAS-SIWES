import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CodeEditor from '../components/CodeEditor.jsx'
import { runCode } from '../lib/runCode.js'

const DEFAULT_CODE = `print("Pyodide OK")
print(2 + 3)

def fib(n):
  a, b = 0, 1
  for _ in range(n):
    a, b = b, a + b
  return a

print("fib(10) =", fib(10))
`

export default function PyodideTest() {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const [meta, setMeta] = useState({ source: null, durationMs: null, ok: null })

  const canShowSource = useMemo(() => {
    return typeof globalThis !== 'undefined'
  }, [])

  const run = async () => {
    setRunning(true)
    setOutput('')
    setMeta({ source: null, durationMs: null, ok: null })
    const res = await runCode({ code, language: 'python', timeoutMs: 20000 })
    const source = canShowSource ? globalThis.__vl_pyodide_source : null
    setOutput(res.output || '')
    setMeta({ source: source || null, durationMs: res.durationMs ?? null, ok: !!res.ok })
    setRunning(false)
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Pyodide Test</h1>
          <div className="subtitle">Browser Python runtime</div>
        </div>
        <Link className="back-link" to="/login">Back</Link>
      </div>
      <div className="page">
        <div className="card">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 12,
            flexWrap: 'wrap',
          }}>
            <div className="muted" style={{ fontSize: '0.92rem' }}>
              Runs Python in the browser via Pyodide. No Supabase required.
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setCode(DEFAULT_CODE)} disabled={running}>
                Reset
              </button>
              <button className="btn btn-sm" onClick={run} disabled={running}>
                {running ? 'Running…' : 'Run Python'}
              </button>
            </div>
          </div>

          <CodeEditor value={code} onChange={setCode} language="python" height="44vh" mobile />
        </div>

        <div className="card">
          <h2>Output</h2>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
            background: '#030303',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: 12,
            minHeight: 120,
          }}>
            {output || <span className="muted">No output yet.</span>}
          </div>
          <div className="muted-2" style={{ marginTop: 10, fontSize: '0.85rem' }}>
            {meta.ok === null ? '' : `status: ${meta.ok ? 'ok' : 'error'} · `}
            {meta.durationMs == null ? '' : `duration: ${meta.durationMs}ms · `}
            {meta.source ? `pyodide source: ${meta.source}` : ''}
          </div>
        </div>
      </div>
    </>
  )
}
