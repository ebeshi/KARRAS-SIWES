import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CodeEditor from '../components/CodeEditor.jsx'
import { runCode } from '../lib/runCode.js'
import { TASK_LANGUAGES } from '../lib/languages.js'

const SAMPLE_CODE = {
  python: `print("Pyodide OK")
print(2 + 3)
`,
  javascript: `console.log("JavaScript OK")
console.log(2 + 3)
`,
  c: `#include <stdio.h>

int main(void) {
  printf("C WASM OK\\n");
  printf("%d\\n", 2 + 3);
  return 0;
}
`,
  cpp: `#include <iostream>

int main() {
  std::cout << "C++ WASM OK\\n" << 2 + 3 << '\\n';
  return 0;
}
`,
  java: `public class Main {
  public static void main(String[] args) {
    System.out.println("Java OK");
    System.out.println(2 + 3);
  }
}
`,
  csharp: `using System;

Console.WriteLine("C# OK");
Console.WriteLine(2 + 3);
`,
  html: `<!doctype html>
<html>
  <body>
    <h1>Hello from HTML</h1>
    <p>This preview runs in a sandboxed frame.</p>
  </body>
</html>
`,
  css: `body { font: 18px sans-serif; padding: 2rem; }
h1 { color: rebeccapurple; }
button { padding: 0.5rem 1rem; }
`,
}

export default function PyodideTest() {
  const [language, setLanguage] = useState('python')
  const [code, setCode] = useState(SAMPLE_CODE.python)
  const [output, setOutput] = useState('')
  const [previewHtml, setPreviewHtml] = useState(null)
  const [running, setRunning] = useState(false)
  const [meta, setMeta] = useState({ source: null, durationMs: null, ok: null })

  const canShowSource = useMemo(() => {
    return typeof globalThis !== 'undefined'
  }, [])

  const run = async () => {
    setRunning(true)
    setOutput('')
    setPreviewHtml(null)
    setMeta({ source: null, durationMs: null, ok: null })
    try {
      const res = await runCode({ code, language, timeoutMs: 20000 })
      const source = language === 'python' && canShowSource ? globalThis.__vl_pyodide_source : null
      setOutput(res.output || '')
      setPreviewHtml(res.previewHtml || null)
      setMeta({ source: source || null, durationMs: res.durationMs ?? null, ok: !!res.ok })
    } catch (error) {
      setOutput(error.message || String(error))
      setMeta({ source: null, durationMs: null, ok: false })
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Browser Runtime Test</h1>
          <div className="subtitle">Python, JavaScript, C, C++, Java, C#, HTML and CSS</div>
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
              Runs supported languages in the browser. Compilers and runtimes download on first use.
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select
                className="input"
                value={language}
                disabled={running}
                onChange={(e) => {
                  const nextLanguage = e.target.value
                  setLanguage(nextLanguage)
                  setCode(SAMPLE_CODE[nextLanguage])
                  setOutput('')
                  setPreviewHtml(null)
                  setMeta({ source: null, durationMs: null, ok: null })
                }}
                aria-label="Runtime language"
              >
                {TASK_LANGUAGES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <button className="btn btn-secondary btn-sm" onClick={() => setCode(SAMPLE_CODE[language])} disabled={running}>
                Reset
              </button>
              <button className="btn btn-sm" onClick={run} disabled={running}>
                {running ? 'Running…' : ['html', 'css'].includes(language) ? 'Preview' : 'Run'}
              </button>
            </div>
          </div>

          <CodeEditor value={code} onChange={setCode} language={language} height="44vh" mobile />
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
          {previewHtml !== null && (
            <iframe
              title="Runtime test preview"
              sandbox=""
              srcDoc={previewHtml}
              style={{
                display: 'block',
                width: '100%',
                minHeight: 280,
                marginTop: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                background: '#fff',
              }}
            />
          )}
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
