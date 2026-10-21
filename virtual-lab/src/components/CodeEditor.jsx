import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter,
  highlightSpecialChars, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightActiveLine,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  indentOnInput, bracketMatching, foldGutter, foldKeymap,
  syntaxHighlighting, defaultHighlightStyle, StreamLanguage,
} from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { cpp } from '@codemirror/lang-cpp'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { java } from '@codemirror/lang-java'
import { csharp as csharpMode } from '@codemirror/legacy-modes/mode/clike'
import { oneDark } from '@codemirror/theme-one-dark'
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'

const LANG_EXT = {
  javascript: () => javascript(),
  python: () => python(),
  c: () => cpp(),
  cpp: () => cpp(),
  java: () => java(),
  csharp: () => StreamLanguage.define(csharpMode),
  html: () => html(),
  css: () => css(),
  js: () => javascript(),
  py: () => python(),
}

export default function CodeEditor({
  value = '',
  onChange,
  readOnly = false,
  height = '52vh',
  language = 'javascript',
  mobile = false,
}) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const onChangeRef = useRef(onChange)
  const langRef = useRef(language)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((v) => {
      if (v.docChanged && typeof onChangeRef.current === 'function') {
        onChangeRef.current(v.state.doc.toString())
      }
    })

    const langFn = LANG_EXT[language] || LANG_EXT.javascript

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      langFn(),
      oneDark,
      updateListener,
      EditorView.theme({
        '&': {
          height,
          fontSize: mobile ? '16px' : '14px',
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.08)',
        },
        '.cm-scroller': {
          overflow: 'auto',
          touchAction: 'pan-y',
          fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        },
        '.cm-content': {
          padding: mobile ? '14px 10px' : '10px 6px',
          lineHeight: mobile ? 1.7 : 1.55,
        },
        '.cm-line': {
          paddingLeft: 0,
        },
        '.cm-gutters': {
          paddingRight: 4,
          backgroundColor: 'rgba(255,255,255,0.02)',
          border: 'none',
          color: 'rgba(255,255,255,0.22)',
          fontSize: mobile ? '14px' : '12px',
        },
      }, { dark: true }),
    ]

    if (readOnly) {
      extensions.push(EditorView.editable.of(false), EditorState.readOnly.of(true))
    }

    const state = EditorState.create({ doc: value, extensions })
    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    langRef.current = language

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, height, language, mobile])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return <div ref={containerRef} />
}
