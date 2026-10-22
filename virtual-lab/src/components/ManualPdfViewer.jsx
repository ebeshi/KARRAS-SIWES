import { useEffect, useRef, useState } from 'react'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const getInitialPage = (url) => {
  try {
    const hash = new URL(url, window.location.href).hash.slice(1)
    return Math.max(1, Number(new URLSearchParams(hash).get('page')) || 1)
  } catch {
    return 1
  }
}

const getPdfSource = (url) => {
  try {
    const source = new URL(url, window.location.href)
    source.hash = ''
    return source.href
  } catch {
    return url
  }
}

export default function ManualPdfViewer({ url, className = '' }) {
  const canvasRef = useRef(null)
  const viewerRef = useRef(null)
  const [document, setDocument] = useState(null)
  const [pageNumber, setPageNumber] = useState(() => getInitialPage(url))
  const [pageInput, setPageInput] = useState(() => String(getInitialPage(url)))
  const [zoom, setZoom] = useState(1)
  const [viewerWidth, setViewerWidth] = useState(0)
  const [renderedSize, setRenderedSize] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const pdfSource = getPdfSource(url)

  useEffect(() => {
    let active = true
    let loadingTask
    setLoading(true)
    setError(null)
    setDocument(null)

    const loadDocument = async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        if (!active) return
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker
        loadingTask = pdfjs.getDocument(pdfSource)
        const loadedDocument = await loadingTask.promise
        if (active) {
          setDocument(loadedDocument)
          setLoading(false)
        }
      } catch (loadError) {
        if (active) {
          setError(`Could not display this PDF: ${loadError.message || String(loadError)}`)
          setLoading(false)
        }
      }
    }

    loadDocument()

    return () => {
      active = false
      if (loadingTask) {
        loadingTask.destroy().catch((destroyError) => {
          console.error('Could not stop PDF loading task.', destroyError)
        })
      }
    }
  }, [pdfSource])

  useEffect(() => {
    const updateWidth = () => {
      const nextWidth = viewerRef.current?.clientWidth || 0
      setViewerWidth((currentWidth) => currentWidth === nextWidth ? currentWidth : nextWidth)
    }
    updateWidth()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }

    const observer = new ResizeObserver(updateWidth)
    if (viewerRef.current) observer.observe(viewerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const initialPage = getInitialPage(url)
    setPageNumber(initialPage)
    setPageInput(String(initialPage))
  }, [url])

  useEffect(() => {
    setPageInput(String(pageNumber))
  }, [pageNumber])

  useEffect(() => {
    if (!document || !canvasRef.current || viewerWidth <= 0) return

    let active = true
    let renderTask
    setRenderedSize(null)
    const renderPage = async () => {
      try {
        setError(null)
        const page = await document.getPage(pageNumber)
        if (!active || !canvasRef.current) return

        const baseViewport = page.getViewport({ scale: 1 })
        const availableWidth = Math.max(1, viewerWidth - 24)
        const scale = (availableWidth / baseViewport.width) * zoom
        const viewport = page.getViewport({ scale })
        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        const canvas = canvasRef.current
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas rendering is not supported by this browser.')

        canvas.width = Math.ceil(viewport.width * outputScale)
        canvas.height = Math.ceil(viewport.height * outputScale)
        canvas.style.width = `${Math.ceil(viewport.width)}px`
        canvas.style.height = `${Math.ceil(viewport.height)}px`
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        })
        await renderTask.promise
        if (active) {
          setRenderedSize({
            width: Math.ceil(viewport.width),
            height: Math.ceil(viewport.height),
          })
        }
      } catch (renderError) {
        if (active && renderError.name !== 'RenderingCancelledException') {
          setError(`Could not render this PDF page: ${renderError.message || String(renderError)}`)
        }
      }
    }

    renderPage()
    return () => {
      active = false
      renderTask?.cancel()
    }
  }, [document, pageNumber, viewerWidth])

  useEffect(() => {
    if (document && pageNumber > document.numPages) {
      setPageNumber(document.numPages)
    }
  }, [document, pageNumber])

  const goToPage = (value) => {
    const nextPage = Number(value)
    if (!document || !Number.isInteger(nextPage)) {
      setPageInput(String(pageNumber))
      return
    }
    const boundedPage = Math.min(document.numPages, Math.max(1, nextPage))
    setPageNumber(boundedPage)
    setPageInput(String(boundedPage))
  }

  return (
    <section ref={viewerRef} className={`manual-pdf-viewer ${className}`.trim()} aria-label="Manual PDF viewer">
      <div className="manual-pdf-toolbar">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => goToPage(pageNumber - 1)}
          disabled={!document || pageNumber <= 1}
          aria-label="Previous page"
        >
          ‹
        </button>
        <label className="manual-pdf-page">
          <span className="small muted">Page</span>
          <input
            type="number"
            min="1"
            max={document?.numPages || undefined}
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            onBlur={() => goToPage(pageInput)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') goToPage(pageInput)
            }}
            aria-label="PDF page number"
            disabled={!document}
          />
          <span className="small muted">of {document?.numPages || '—'}</span>
        </label>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => goToPage(pageNumber + 1)}
          disabled={!document || pageNumber >= document.numPages}
          aria-label="Next page"
        >
          ›
        </button>
        <span className="manual-pdf-toolbar-spacer" />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setZoom((value) => Math.max(0.75, Math.round((value - 0.25) * 100) / 100))}
          disabled={zoom <= 0.75}
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="small muted manual-pdf-zoom">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setZoom((value) => Math.min(2.5, Math.round((value + 0.25) * 100) / 100))}
          disabled={zoom >= 2.5}
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
      <div className="manual-pdf-page-container">
        {loading && <div className="manual-pdf-status">Loading manual…</div>}
        {error && (
          <div className="manual-pdf-status manual-pdf-error" role="alert">
            <p>{error}</p>
            <a href={url} target="_blank" rel="noreferrer noopener">Open or download the original PDF</a>
          </div>
        )}
        <div
          className="manual-pdf-canvas-wrap"
          style={renderedSize ? {
            width: `${renderedSize.width * zoom}px`,
            height: `${renderedSize.height * zoom}px`,
          } : undefined}
        >
          <canvas
            ref={canvasRef}
            className="manual-pdf-canvas"
            style={renderedSize ? {
              width: `${renderedSize.width}px`,
              height: `${renderedSize.height}px`,
              transform: `scale(${zoom})`,
            } : undefined}
            aria-label={`PDF page ${pageNumber}`}
          />
        </div>
      </div>
    </section>
  )
}
