import { normalizeTaskLanguage, TASK_LANGUAGES } from './languages.js'

const LANGS = new Set([...TASK_LANGUAGES.map(({ value }) => value), 'js', 'py', 'c++'])

export const validateManualImport = (raw) => {
  if (!raw || typeof raw !== 'object') return fail('JSON payload must be an object')
  const m = raw

  const errors = []
  if (!m.course_code || typeof m.course_code !== 'string') errors.push('course_code is required (e.g. CSC222)')
  if (!m.title || typeof m.title !== 'string') errors.push('title is required')
  if (!m.deadline) errors.push('deadline is required (ISO string)')
  if (m.deadline) {
    const d = new Date(m.deadline)
    if (Number.isNaN(d.getTime())) errors.push('deadline is not a valid ISO date')
  }
  if (!Array.isArray(m.tasks)) {
    errors.push('tasks must be an array of task objects')
    return { ok: false, errors }
  }
  if (m.tasks.length === 0) errors.push('tasks array is empty')
  if (m.tasks.length > 200) errors.push('tasks array exceeds 200 items')

  const orderSeen = new Set()
  m.tasks.forEach((t, idx) => {
    const order = typeof t.order_index === 'number' ? t.order_index : (idx + 1)
    if (!t.title || typeof t.title !== 'string') {
      errors.push(`tasks[${idx}].title is required`)
    }
    if (t.language && !LANGS.has(t.language)) {
      errors.push(`tasks[${idx}].language must be one of: ${Array.from(LANGS).join(', ')}`)
    }
    if (typeof t.points !== 'undefined' && (typeof t.points !== 'number' || t.points < 0)) {
      errors.push(`tasks[${idx}].points must be a non-negative number`)
    }
    if (orderSeen.has(order)) {
      errors.push(`tasks[${idx}] duplicate order_index ${order}`)
    }
    orderSeen.add(order)
  })

  if (errors.length) return { ok: false, errors }

  const normalizedTasks = m.tasks
    .map((t, idx) => ({
      order_index: typeof t.order_index === 'number' ? t.order_index : (idx + 1),
      title: String(t.title).trim(),
      instruction_text: String(t.instruction_text || '').trim(),
      pdf_section_label: t.pdf_section_label ? String(t.pdf_section_label).trim() : null,
      pdf_page_start: typeof t.pdf_page_start === 'number' ? t.pdf_page_start : null,
      pdf_page_end: typeof t.pdf_page_end === 'number' ? t.pdf_page_end : null,
      language: normalizeTaskLanguage(t.language),
      starter_code: String(t.starter_code || ''),
      expected_output: ['html', 'css'].includes(normalizeTaskLanguage(t.language))
        ? null
        : (t.expected_output ? String(t.expected_output) : null),
      points: typeof t.points === 'number' ? t.points : 10,
    }))
    .sort((a, b) => a.order_index - b.order_index)

  return {
    ok: true,
    errors: [],
    normalized: {
      course_code: String(m.course_code).trim(),
      title: String(m.title).trim(),
      description: String(m.description || '').trim(),
      semester: m.semester ? String(m.semester).trim() : null,
      deadline: new Date(m.deadline).toISOString(),
      published: m.published === true,
      import_batch_id: m.import_batch_id ? String(m.import_batch_id) : null,
      tasks: normalizedTasks,
    },
  }
}

const fail = (msg) => ({ ok: false, errors: [msg] })

export const SAMPLE_IMPORT = {
  course_code: 'CSC222',
  title: 'Game Programming with Pygame — Lab Manual',
  description: 'Introductory Pygame lab pack.',
  semester: '2026/27 Semester 1',
  deadline: new Date(Date.now() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString(),
  published: true,
  import_batch_id: 'demo-csc222-v1',
  tasks: [
    {
      order_index: 1,
      title: 'Task 1.1 — Initialize a Pygame window',
      instruction_text: 'Create a 640x480 Pygame window with a caption. Quit on window close.',
      pdf_section_label: 'Section 1.2',
      pdf_page_start: 6,
      pdf_page_end: 9,
      language: 'python',
      points: 10,
      starter_code: `import pygame\n\npygame.init()\nscreen = pygame.display.set_mode((640, 480))\n`,
    },
    {
      order_index: 2,
      title: 'Task 2.1 — Draw a colored rectangle',
      instruction_text: 'Black background, red rectangle at (50,50) sized 120x80.',
      pdf_section_label: 'Section 2.1',
      pdf_page_start: 16,
      pdf_page_end: 19,
      language: 'python',
      points: 15,
      starter_code: `import pygame\n\npygame.init()\nscreen = pygame.display.set_mode((640, 480))\n`,
    },
  ],
}
