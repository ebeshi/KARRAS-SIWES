import { supabase } from './supabase.js'

export const listManualsForInstructor = async (instructorId) => {
  const { data, error } = await supabase
    .from('manuals')
    .select(`
      id, course_code, title, description, semester, deadline,
      manual_pdf_url, published, import_batch_id, created_at,
      tasks (id, order_index),
      manual_enrollments (student_id)
    `)
    .eq('instructor_id', instructorId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map((m) => ({
    ...m,
    task_count: (m.tasks || []).length,
    enrollment_count: (m.manual_enrollments || []).length,
  }))
}

export const createManual = async (payload) => {
  const { data, error } = await supabase
    .from('manuals')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export const upsertTasksForManual = async (manualId, tasks) => {
  if (!tasks.length) return []
  const withFk = tasks.map((t) => ({ ...t, manual_id: manualId }))
  const { data, error } = await supabase
    .from('tasks')
    .upsert(withFk, { onConflict: 'manual_id, order_index', ignoreDuplicates: false })
    .select()
  if (error) throw error
  return data || []
}

export const deleteTasksById = async (taskIds) => {
  if (!taskIds.length) return
  const { error } = await supabase.from('tasks').delete().in('id', taskIds)
  if (error) throw error
}

export const getManualDetailForInstructor = async (manualId, instructorId) => {
  const { data: manual, error: mErr } = await supabase
    .from('manuals')
    .select('*')
    .eq('id', manualId)
    .eq('instructor_id', instructorId)
    .single()
  if (mErr) throw mErr
  const { data: tasks, error: tErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('manual_id', manualId)
    .order('order_index', { ascending: true })
  if (tErr) throw tErr
  return { manual, tasks: tasks || [] }
}

export const getManualProgressRows = async (manualId, tasks) => {
  const { data, error } = await supabase
    .from('task_submissions')
    .select(`
      task_id, student_id, status, grade, auto_passed, submitted_at,
      users!task_submissions_student_id_fkey(id, full_name, email, matric_no, faculty, department, level)
    `)
    .eq('manual_id', manualId)
  if (error) throw error

  // Also fetch all enrolled students who have NOT started yet so they appear in the grading grid
  const { data: enrollments, error: enrollErr } = await supabase
    .from('manual_enrollments')
    .select(`student_id, users:student_id(id, full_name, email, matric_no, faculty, department, level)`)
    .eq('manual_id', manualId)
  if (enrollErr) throw enrollErr

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
  for (const s of data || []) pushOne(s.users, { task_id: s.task_id, grade: s.grade, status: s.status, auto_passed: s.auto_passed, submitted_at: s.submitted_at })
  for (const e of enrollments || []) pushOne(e.users, null)

  const rows = Array.from(byStudent.values()).map((r) => {
    let total = 0
    let submitted = 0
    let graded = 0
    let evaluated = 0
    let passed = 0
    for (const t of tasks) {
      const g = r.taskGrades[t.id]
      if (!g) continue
      if (['submitted','graded'].includes(g.status)) submitted++
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
  const { data: enrolled, error: enErr } = await supabase
    .from('manual_enrollments')
    .select('manual_id')
    .eq('student_id', studentId)
  if (enErr) throw enErr
  const enrolledIds = new Set((enrolled || []).map((e) => e.manual_id))

  const { data: manuals, error: mErr } = await supabase
    .from('manuals')
    .select(`
      id, course_code, title, description, semester, deadline,
      manual_pdf_url, published, created_at, instructor_id,
      tasks (id, order_index, title)
    `)
    .eq('published', true)
    .order('created_at', { ascending: false })
  if (mErr) throw mErr

  const manualIds = (manuals || []).map((m) => m.id)
  const { data: subs, error: sErr } = manualIds.length ? await supabase
    .from('task_submissions')
    .select('manual_id, task_id, status')
    .eq('student_id', studentId)
    .in('manual_id', manualIds) : { data: [], error: null }
  if (sErr) throw sErr

  const byManual = {}
  for (const s of subs || []) {
    byManual[s.manual_id] = byManual[s.manual_id] || {}
    byManual[s.manual_id][s.task_id] = s.status
  }

  return (manuals || []).map((m) => {
    const tasks = (m.tasks || []).slice().sort((a, b) => a.order_index - b.order_index)
    const total = tasks.length
    const done = tasks.reduce((acc, t) => {
      const st = byManual[m.id]?.[t.id]
      return acc + (['submitted','graded'].includes(st) ? 1 : 0)
    }, 0)
    return {
      ...m,
      task_count: total,
      submitted_count: done,
      progress_pct: total ? Math.round((done / total) * 100) : 0,
      enrolled: enrolledIds.has(m.id),
      task_status_map: byManual[m.id] || {},
    }
  })
}

export const enrollInManual = async (manualId, studentId) => {
  if (!manualId || !studentId) throw new Error('Enroll requires both manual and student id')
  const exists = await supabase
    .from('manual_enrollments')
    .select('id')
    .eq('manual_id', manualId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (exists?.data) return exists.data
  const { data, error } = await supabase
    .from('manual_enrollments')
    .insert({ manual_id: manualId, student_id: studentId })
    .select()
    .maybeSingle()
  if (error) {
    const msg = String(error.message || error)
    if (/duplicate|unique|violation/i.test(msg)) return null
    throw error
  }
  return data
}

export const getManualForStudentWorkspace = async (manualId) => {
  const { data: manual, error: mErr } = await supabase
    .from('manuals')
    .select('*')
    .eq('id', manualId)
    .eq('published', true)
    .single()
  if (mErr) throw mErr
  const { data: tasks, error: tErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('manual_id', manualId)
    .order('order_index', { ascending: true })
  if (tErr) throw tErr
  return { manual, tasks: tasks || [] }
}

export const listStudentSubmissionsForManual = async (manualId, studentId) => {
  const { data, error } = await supabase
    .from('task_submissions')
    .select('*')
    .eq('manual_id', manualId)
    .eq('student_id', studentId)
  if (error) throw error
  const map = {}
  for (const s of data || []) map[s.task_id] = s
  return map
}

export const upsertTaskSubmission = async (payload) => {
  const { data, error } = await supabase
    .from('task_submissions')
    .upsert(payload, { onConflict: 'task_id, student_id', ignoreDuplicates: false })
    .select()
    .single()
  if (error) throw error
  return data
}

export const updateManual = async (manualId, patch) => {
  const { data, error } = await supabase
    .from('manuals')
    .update(patch)
    .eq('id', manualId)
    .select()
    .single()
  if (error) throw error
  return data
}

export const deleteManual = async (manualId) => {
  const { error } = await supabase.from('manuals').delete().eq('id', manualId)
  if (error) throw error
}
