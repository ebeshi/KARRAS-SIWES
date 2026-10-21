const JS_WHITELIST_GLOBALS = new Set([
  'console', 'Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number',
  'Boolean', 'RegExp', 'Error', 'TypeError', 'SyntaxError', 'parseInt', 'parseFloat',
  'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'Set', 'Map',
  'Promise', 'Symbol', 'NaN', 'Infinity', 'undefined', 'null', 'BigInt',
])

let pyodideLoaded = false
let pyodideLoadingPromise = null
const captureStdoutKey = 'py_stdout_capture'

const CDN_PYODIDE_VERSIONS = [
  { label: 'cdn-v0.26.3', indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.3/full/' },
  { label: 'cdnjs-v0.26.3', indexURL: 'https://cdnjs.cloudflare.com/ajax/libs/pyodide/0.26.3/' },
  { label: 'cdn-v0.25.1', indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/' },
]
const CLANG_WASM_VERSION = '0.3.0'
const CLANG_WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@live-codes/clang-wasm@${CLANG_WASM_VERSION}/assets/`
const CLANG_WASM_BUNDLE_URL = `https://cdn.jsdelivr.net/npm/@live-codes/clang-wasm@${CLANG_WASM_VERSION}/dist/clang-wasm.global.js`
const CLANG_STARTUP_TIMEOUT_MS = 90000
const CHEERPJ_LOADER_URL = 'https://cjrtnc.leaningtech.com/4.3/loader.js'
const JAVAC_JAR_URL = 'https://unpkg.com/dataslope-tools-jar@1.0.0/tools.jar'
const JAVA_RUNTIME_TIMEOUT_MS = 300000

let csharpModulePromise = null
let javaRuntimePromise = null
let javaRunId = 0
let cheerpjScriptPromise = null

const withTimeout = (promise, timeoutMs, message) => {
  let timeout
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timeout))
}

const runClang = (code, language, stdin, timeoutMs = 60000) => new Promise((resolve) => {
  const workerSource = `
    importScripts(${JSON.stringify(CLANG_WASM_BUNDLE_URL)});
    self.onmessage = async ({ data }) => {
      try {
        const compiler = await self.clangWasm.createCompiler(data.language, {
          baseUrl: data.baseUrl,
          std: data.language === 'c' ? 'gnu17' : 'gnu++20',
        });
        self.postMessage({ ready: true });
        const result = await compiler.run(data.code, data.stdin);
        self.postMessage({
          ok: result.exitCode === 0,
          output: result.output || result.errors?.join('\\n') || '',
          exitCode: result.exitCode,
        });
      } catch (error) {
        self.postMessage({ ok: false, error: error?.message || String(error) });
      }
    };
  `
  const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
  const worker = new Worker(workerUrl)
  let timer = setTimeout(() => {
    worker.terminate()
    URL.revokeObjectURL(workerUrl)
    resolve({ ok: false, output: '[timeout] C/C++ WebAssembly runtime took too long to load.' })
  }, CLANG_STARTUP_TIMEOUT_MS)

  worker.onmessage = ({ data }) => {
    if (data.ready) {
      clearTimeout(timer)
      timer = setTimeout(() => {
        worker.terminate()
        URL.revokeObjectURL(workerUrl)
        resolve({ ok: false, output: `[timeout] ${language.toUpperCase()} execution exceeded ${timeoutMs}ms` })
      }, timeoutMs)
      return
    }
    clearTimeout(timer)
    worker.terminate()
    URL.revokeObjectURL(workerUrl)
    resolve(data.error
      ? { ok: false, output: `[compiler error] ${data.error}` }
      : { ok: data.ok, output: data.output, exitCode: data.exitCode })
  }
  worker.onerror = (event) => {
    clearTimeout(timer)
    worker.terminate()
    URL.revokeObjectURL(workerUrl)
    resolve({ ok: false, output: `[compiler error] ${event.message || 'Failed to start the C/C++ WebAssembly runtime.'}` })
  }
  worker.postMessage({ code, language, stdin, baseUrl: CLANG_WASM_BASE_URL })
})

const runCsharp = async (code) => {
  if (!csharpModulePromise) {
    csharpModulePromise = import('@wasmsharp/core')
      .then(({ WasmSharpModule }) => WasmSharpModule.initializeAsync())
      .catch((error) => {
        csharpModulePromise = null
        throw error
      })
  }
  const module = await csharpModulePromise
  const compilation = await module.createCompilationAsync(code)
  const result = await compilation.run()
  if (result.success) {
    return { ok: true, output: result.stdOut + (result.stdErr ? `\n${result.stdErr}` : '') }
  }
  return {
    ok: false,
    output: result.diagnostics.map(({ severity, message, location }) => {
      const before = code.slice(0, location.start)
      const lines = before.split('\n')
      return `${severity} (${lines.length}:${lines.at(-1).length + 1}): ${message}`
    }
    ).join('\n') || 'C# compilation failed.',
  }
}

const addScript = (src) => {
  if (typeof globalThis.cheerpjInit === 'function') return Promise.resolve()
  if (cheerpjScriptPromise) return cheerpjScriptPromise

  const script = [...document.scripts].find((element) => element.src === src)
    || document.createElement('script')
  if (!script.src) {
    script.src = src
    script.async = true
  }
  cheerpjScriptPromise = new Promise((resolve, reject) => {
    script.addEventListener('load', resolve, { once: true })
    script.addEventListener('error', () => {
      cheerpjScriptPromise = null
      reject(new Error(`Failed to load Java runtime script: ${src}`))
    }, { once: true })
  })
  if (!script.isConnected) document.head.appendChild(script)
  return cheerpjScriptPromise
}

const ensureJavaRuntime = () => {
  if (!javaRuntimePromise) {
    javaRuntimePromise = (async () => {
      if (typeof globalThis.cheerpjInit !== 'function') {
        if (cheerpjScriptPromise) await cheerpjScriptPromise
        else await addScript(CHEERPJ_LOADER_URL)
      }
      if (typeof globalThis.cheerpjInit !== 'function') throw new Error('CheerpJ did not expose its initialization API.')
      const compilerBytesPromise = fetch(JAVAC_JAR_URL).then(async (response) => {
        if (!response.ok) throw new Error(`Failed to download the Java compiler (HTTP ${response.status}).`)
        return new Uint8Array(await response.arrayBuffer())
      })
      const [, compilerBytes] = await Promise.all([
        globalThis.cheerpjInit({ status: 'none' }),
        compilerBytesPromise,
      ])
      if (typeof globalThis.cheerpjAddStringFile !== 'function'
        || typeof globalThis.cheerpjRunMain !== 'function'
        || typeof globalThis.cheerpOSCreateDir !== 'function') {
        throw new Error('CheerpJ did not expose its Java execution API.')
      }
      globalThis.cheerpjAddStringFile('/str/tools.jar', compilerBytes)
      return {
        runMain: globalThis.cheerpjRunMain.bind(globalThis),
        addStringFile: globalThis.cheerpjAddStringFile.bind(globalThis),
        createDir: globalThis.cheerpOSCreateDir.bind(globalThis),
      }
    })().catch((error) => {
      javaRuntimePromise = null
      throw error
    })
  }
  return javaRuntimePromise
}

const runJava = async (code) => {
  const className = code.match(/\b(?:public\s+)?class\s+([A-Za-z_$][\w$]*)/)?.[1]
  if (!className) {
    return { ok: false, output: 'Java source must declare a class containing a main method.' }
  }
  const packageName = code.match(/\bpackage\s+([\w.]+)\s*;/)?.[1]
  const mainClass = packageName ? `${packageName}.${className}` : className
  const runtime = await withTimeout(
    ensureJavaRuntime(),
    JAVA_RUNTIME_TIMEOUT_MS,
    'Java runtime initialization timed out while loading CheerpJ or its compiler. Check the runtime CDN connection and reload before retrying.',
  )
  const sourcePath = `/str/${className}.java`
  runtime.addStringFile(sourcePath, new TextEncoder().encode(code))
  const outputPath = `/files/java-run-${++javaRunId}/`
  const dirParts = outputPath.slice('/files/'.length).split('/').filter(Boolean)
  let currentPath = '/files'
  for (const part of dirParts) {
    currentPath += `/${part}`
    const created = await new Promise((resolve) => {
      const result = {}
      runtime.createDir(currentPath, result, 0o777, () => resolve(result.exists))
    })
    if (created !== 5) throw new Error(`Could not create Java output directory ${currentPath}.`)
  }

  let output = ''
  const originalConsole = {}
  const capturedMethods = ['log', 'error']
  for (const method of capturedMethods) {
    originalConsole[method] = console[method]
    console[method] = (...args) => {
      output += `${args.map((value) => typeof value === 'string' ? value : String(value)).join(' ')}\n`
      originalConsole[method].apply(console, args)
    }
  }
  try {
    const compileExitCode = await withTimeout(
      runtime.runMain(
        'com.sun.tools.javac.Main',
        `/str/tools.jar:${outputPath}`,
        sourcePath,
        '-d',
        outputPath,
      ),
      JAVA_RUNTIME_TIMEOUT_MS,
      'Java compilation timed out. The browser runtime may still be busy; reload before running Java again.',
    )
    if (compileExitCode !== 0) {
      return { ok: false, output: output.trim() || `Java compilation failed (exit code ${compileExitCode}).` }
    }
    output = ''
    const runExitCode = await withTimeout(
      runtime.runMain(mainClass, outputPath),
      JAVA_RUNTIME_TIMEOUT_MS,
      'Java program timed out. CheerpJ cannot safely interrupt it; reload before running Java again.',
    )
    return {
      ok: runExitCode === 0,
      output: output.trim() || (runExitCode === 0 ? '(Program completed with no output.)' : `Java program exited with code ${runExitCode}.`),
    }
  } finally {
    for (const method of capturedMethods) console[method] = originalConsole[method]
  }
}

const runWebPreview = (code, language) => {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">`
  const previewHtml = language === 'css'
    ? `<!doctype html><html><head><meta charset="utf-8">${policy}<style>${code.replace(/<\/style/gi, '\\3C /style')}</style></head><body><h1>CSS preview</h1><p>Edit the CSS to style this page.</p><button>Example button</button></body></html>`
    : /<head\b[^>]*>/i.test(code)
      ? code.replace(/<head\b[^>]*>/i, (head) => `${head}${policy}`)
      : `<!doctype html><html><head>${policy}</head><body>${code}</body></html>`
  return { ok: true, output: 'Preview rendered below.', previewHtml }
}

const loadPyodideFromCDN = async ({ indexURL }) => {
  let mod
  try {
    mod = await import(/* @vite-ignore */ indexURL + 'pyodide.mjs')
  } catch (e) {
    try {
      mod = await import(/* @vite-ignore */ indexURL + 'pyodide.asm.mjs')
    } catch (err2) {
      throw new Error(`CDN pyodide fetch failed (tried pyodide.mjs + pyodide.asm.mjs at ${indexURL}): ${e.message || String(e)}`)
    }
  }
  if (!mod?.loadPyodide) throw new Error(`pyodide module at ${indexURL} has no loadPyodide export`)
  const py = await mod.loadPyodide({ indexURL })
  return { py, source: 'CDN ' + indexURL }
}

const loadPyodideFromGlobal = async () => {
  if (globalThis.loadPyodide) {
    const py = await globalThis.loadPyodide()
    return { py, source: 'globalThis script tag' }
  }
  throw new Error('loadPyodide not on globalThis')
}

const installCaptureSetup = async (py) => {
  const capturePy = `
import sys
import io
_${captureStdoutKey}_stdout = io.StringIO()
_${captureStdoutKey}_stderr = io.StringIO()
sys.stdout = _${captureStdoutKey}_stdout
sys.stderr = _${captureStdoutKey}_stderr
`
  await py.runPythonAsync(capturePy)
}

const ensurePyodide = async () => {
  if (pyodideLoaded) return
  if (pyodideLoadingPromise) return pyodideLoadingPromise
  pyodideLoadingPromise = (async () => {
    const errors = []
    for (const candidate of CDN_PYODIDE_VERSIONS) {
      try {
        const { py, source } = await loadPyodideFromCDN({ indexURL: candidate.indexURL })
        await installCaptureSetup(py)
        globalThis.__vl_pyodide = py
        globalThis.__vl_pyodide_source = source
        pyodideLoaded = true
        return
      } catch (err) {
        errors.push(`[${candidate.label}] ${err.message || String(err)}`)
      }
    }
    try {
      const { py, source } = await loadPyodideFromGlobal()
      await installCaptureSetup(py)
      globalThis.__vl_pyodide = py
      globalThis.__vl_pyodide_source = source
      pyodideLoaded = true
      return
    } catch (err) {
      errors.push(`[globalThis] ${err.message || String(err)}`)
    }
    pyodideLoadingPromise = null
    throw new Error(
      'Python runtime failed to load from all sources. Tried:\n- ' + errors.join('\n- ')
    )
  })()
  return pyodideLoadingPromise
}

export const runCode = async ({ code, language = 'javascript', stdin = '', expectedOutput = null, timeoutMs = 15000 }) => {
  const t0 = Date.now()
  try {
    if (language === 'javascript' || language === 'js') {
      const out = await runJs(code, { stdin, timeoutMs })
      return { ...out, durationMs: Date.now() - t0, passed: diffExpected(out, expectedOutput) }
    }
    if (language === 'python' || language === 'py') {
      const out = await runPython(code, { stdin, timeoutMs })
      return { ...out, durationMs: Date.now() - t0, passed: diffExpected(out, expectedOutput) }
    }
    if (language === 'c' || language === 'cpp') {
      const out = await runClang(code, language, stdin, Math.max(timeoutMs, 60000))
      return { ...out, durationMs: Date.now() - t0, passed: diffExpected(out, expectedOutput) }
    }
    if (language === 'csharp' || language === 'cs') {
      const out = await runCsharp(code)
      return { ...out, durationMs: Date.now() - t0, passed: diffExpected(out, expectedOutput) }
    }
    if (language === 'java') {
      const out = await runJava(code)
      return { ...out, durationMs: Date.now() - t0, passed: diffExpected(out, expectedOutput) }
    }
    if (language === 'html' || language === 'css') {
      const out = runWebPreview(code, language)
      return { ...out, durationMs: Date.now() - t0, passed: null }
    }
    return { ok: false, output: `Unsupported language: ${language}`, durationMs: Date.now() - t0, passed: false }
  } catch (err) {
    return {
      ok: false,
      output: `[runtime error] ${err.message || String(err)}`,
      durationMs: Date.now() - t0,
      passed: false,
    }
  }
}

const diffExpected = (out, expectedOutput) => {
  if (!expectedOutput || expectedOutput.trim() === '') return null
  const a = (out?.output || '').trim().replace(/\r\n/g, '\n')
  const b = String(expectedOutput).trim().replace(/\r\n/g, '\n')
  return a === b
}

const runJs = (code, { stdin = '', timeoutMs = 10000 } = {}) => {
  return new Promise((resolve) => {
    let output = ''
    const timer = setTimeout(() => resolve({ ok: false, output: '[timeout] JavaScript execution exceeded ' + timeoutMs + 'ms' }), timeoutMs)
    try {
      const fakeConsole = {
        log: (...args) => { output += args.map(anyToString).join(' ') + '\n' },
        error: (...args) => { output += args.map(anyToString).join(' ') + '\n' },
        warn: (...args) => { output += args.map(anyToString).join(' ') + '\n' },
        info: (...args) => { output += args.map(anyToString).join(' ') + '\n' },
      }
      const globalProxy = new Proxy(globalThis, {
        get(target, prop) {
          if (prop === 'console') return fakeConsole
          if (prop === 'process') return { stdin: { read: () => stdin } }
          if (JS_WHITELIST_GLOBALS.has(String(prop))) return target[prop]
          if (String(prop) === Symbol.unscopables) return undefined
          return undefined
        },
        has() { return true },
      })
      const fn = new Function('globalThis', 'console', `
        with (globalThis) {
          ;(${wrapCode(code)}\n)();
        }
      `)
      const result = fn.call(undefined, globalProxy, fakeConsole)
      if (typeof result?.then === 'function') {
        result.then((rv) => {
          clearTimeout(timer)
          if (rv !== undefined) output += (output ? '\n' : '') + anyToString(rv)
          resolve({ ok: true, output })
        }).catch((err) => {
          clearTimeout(timer)
          resolve({ ok: false, output: `[exception] ${err.message || String(err)}` })
        })
      } else {
        clearTimeout(timer)
        if (result !== undefined) output += (output ? '\n' : '') + anyToString(result)
        resolve({ ok: true, output })
      }
    } catch (err) {
      clearTimeout(timer)
      resolve({ ok: false, output: `[syntax/error] ${err.message || String(err)}` })
    }
  })
}

const wrapCode = (code) => `function () {
"use strict";
${code}
}`

const anyToString = (v) => {
  try {
    if (typeof v === 'string') return v
    if (typeof v === 'number' || typeof v === 'boolean' || v == null) return String(v)
    if (typeof v === 'object') return JSON.stringify(v, null, 2)
    return String(v)
  } catch { return String(v) }
}

const runPython = async (code, { timeoutMs = 20000 } = {}) => {
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true }, timeoutMs)
  try {
    await ensurePyodide()
    const py = globalThis.__vl_pyodide
    if (!py) return { ok: false, output: '[init error] Python runtime failed to load' }
    // Clear buffers
    await py.runPythonAsync(`
sys.stdout.seek(0)
sys.stdout.truncate(0)
sys.stderr.seek(0)
sys.stderr.truncate(0)
`)
    let err = null
    try {
      await py.runPythonAsync(code)
    } catch (e) {
      err = e
    }
    await py.runPythonAsync(`
_out = sys.stdout.getvalue()
_err = sys.stderr.getvalue()
`)
    const out = (py.globals.get('_out') || '') + (py.globals.get('_err') ? '\n' + py.globals.get('_err') : '')
    clearTimeout(timer)
    if (timedOut) return { ok: false, output: '[timeout] Python execution exceeded ' + timeoutMs + 'ms' }
    return { ok: !err, output: (out || '') + (err ? `\n[exception] ${err.message || String(err)}` : '') }
  } catch (e) {
    clearTimeout(timer)
    return { ok: false, output: `[python error] ${e.message || String(e)}` }
  }
}
