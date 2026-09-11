// API Client module replacing Supabase queries with Express + MySQL backend

const BASE_URL = '/api'

async function request(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}: ${res.statusText}`)
  }

  return data
}

export const auth = {
  async signIn(email, password) {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    return res
  },

  async getProfile(userId) {
    if (!userId) return null
    return await request(`/auth/me/${userId}`)
  }
}

export const uploadPdf = async (file) => {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.error || 'PDF upload failed')
  }

  const data = await res.json()
  return data.url
}

export const listManualsForInstructor = async (instructorId) => {
  const query = instructorId ? `?instructorId=${encodeURIComponent(instructorId)}` : ''
  return await request(`/instructor/manuals${query}`)
}

export const createManual = async (payload) => {
  return await request('/instructor/manuals', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export const updateManual = async (manualId, patch) => {
  return await request(`/instructor/manuals/${manualId}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export const deleteManual = async (manualId) => {
  return await request(`/instructor/manuals/${manualId}`, {
    method: 'DELETE',
  })
}

export const getManualDetailForInstructor = async (manualId) => {
  return await request(`/instructor/manuals/${manualId}`)
}

export const upsertTasksForManual = async (manualId, tasks, deleteIds = []) => {
  return await request(`/instructor/manuals/${manualId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ tasks, deleteIds }),
  })
}

export const deleteTasksById = async (manualId, taskIds) => {
  if (!taskIds || !taskIds.length) return
  return await request(`/instructor/manuals/${manualId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ deleteIds: taskIds }),
  })
}

export const getManualProgressRows = async (manualId, tasks) => {
  const data = await request(`/instructor/manuals/${manualId}/progress`)
  const submissions = data.submissions || []
  const enrollments = data.enrollments || []

  const byStudent = new Map()
  const pushOne = (u, seed) => {
    if (!u?.id) return
    if (!byStudent.has(u.id)) {
      byStudent.set(u.id, {
        studentId: u.id,
        email: u.email || '',
        fullName: u.full_name || '',
        matricNo: u.matric_no || '',
        faculty: u.faculty || '',
        department: u.department || '',
        level: u.level || '',
        taskGrades: {},
      })
    }
    if (seed) {
      const r = byStudent.get(u.id)
      r.taskGrades[seed.task_id] = { ...(r.taskGrades[seed.task_id] || {}), ...seed }
    }
  }

  for (const s of submissions) {
    const studentUser = {
      id: s.student_id,
      full_name: s.full_name,
      email: s.email,
      matric_no: s.matric_no,
      faculty: s.faculty,
      department: s.department,
      level: s.level,
    }
    pushOne(studentUser, {
      task_id: s.task_id,
      grade: s.grade,
      status: s.status,
      auto_passed: s.auto_passed === 1 || s.auto_passed === true,
      submitted_at: s.submitted_at,
    })
  }

  for (const e of enrollments) {
    const studentUser = {
      id: e.student_id,
      full_name: e.full_name,
      email: e.email,
      matric_no: e.matric_no,
      faculty: e.faculty,
      department: e.department,
      level: e.level,
    }
    pushOne(studentUser, null)
  }

  const rows = Array.from(byStudent.values()).map((r) => {
    let total = 0
    let submitted = 0
    let graded = 0
    let evaluated = 0
    let passed = 0

    for (const t of tasks) {
      const g = r.taskGrades[t.id]
      if (!g) continue
      if (['submitted', 'graded'].includes(g.status)) submitted++
      const pts = Number(t.points || 0)
      const hasEval = typeof g.auto_passed === 'boolean'
      const effective = typeof g.grade === 'number'
        ? Number(g.grade) || 0
        : (hasEval ? (g.auto_passed ? pts : 0) : 0)

      if (g.status === 'graded') graded++
      if (hasEval) {
        evaluated++
        if (g.auto_passed) passed++
      }
      total += effective
    }

    const possible = tasks.reduce((a, t) => a + Number(t.points || 0), 0)
    const pct = possible ? (total / possible) * 100 : 0
    let statusLabel = 'Not started'
    if (submitted === tasks.length && tasks.length > 0) statusLabel = 'All submitted'
    else if (submitted > 0) statusLabel = `${submitted}/${tasks.length} in progress`
    if (graded === tasks.length && tasks.length > 0) statusLabel = 'All graded'
    if (evaluated === tasks.length && tasks.length > 0) statusLabel = passed === tasks.length ? 'All correct' : 'Submitted (some wrong)'

    return { ...r, total, possible, pct: Number(pct.toFixed(2)), statusLabel }
  })

  rows.sort((a, b) => a.fullName.localeCompare(b.fullName))
  return rows
}

export const listManualsForStudent = async (studentId) => {
  const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''
  return await request(`/student/manuals${query}`)
}

export const enrollInManual = async (manualId, studentId) => {
  return await request('/student/enroll', {
    method: 'POST',
    body: JSON.stringify({ manualId, studentId }),
  })
}

export const getManualForStudentWorkspace = async (manualId) => {
  return await request(`/student/manuals/${manualId}`)
}

export const listStudentSubmissionsForManual = async (manualId, studentId) => {
  const submissions = await request(`/student/submissions?manualId=${manualId}&studentId=${studentId}`)
  const map = {}
  for (const s of submissions) {
    map[s.task_id] = {
      ...s,
      auto_passed: s.auto_passed === 1 || s.auto_passed === true
    }
  }
  return map
}

export const upsertTaskSubmission = async (payload) => {
  return await request('/student/submissions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
