import { supabase } from './supabase.js'

const requireSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }
  return supabase
}

const throwIfError = ({ data, error }) => {
  if (error) throw new Error(error.message)
  return data
}

const one = (result, message) => {
  const data = throwIfError(result)
  if (!data) throw new Error(message)
  return data
}

const profileWithInstitution = async (userId) => {
  const client = requireSupabase()
  const profile = one(
    await client.from('users').select('*').eq('id', userId).maybeSingle(),
    'Your account profile is missing. Contact your administrator.',
  )
  if (!profile.institution_id) return profile

  const institution = one(
    await client.from('institutions')
      .select('name, school_code')
      .eq('id', profile.institution_id)
      .maybeSingle(),
    'Your institution profile could not be loaded.',
  )
  return {
    ...profile,
    institution_name: institution.name,
    school_code: institution.school_code,
  }
}

const signUp = async (email, password, metadata) => {
  const client = requireSupabase()
  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: metadata,
      emailRedirectTo: `${window.location.origin}/login`,
    },
  })
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Supabase did not return a user for this registration.')

  const user = { id: data.user.id, email: data.user.email }
  if (!data.session) {
    return { user, profile: null, confirmationRequired: true }
  }

  return {
    user,
    profile: await profileWithInstitution(data.user.id),
    confirmationRequired: false,
  }
}

export const auth = {
  async signIn(email, password) {
    const client = requireSupabase()
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) throw new Error(error.message)
    if (!data.user) throw new Error('Supabase did not return a signed-in user.')
    return {
      user: { id: data.user.id, email: data.user.email },
      profile: await profileWithInstitution(data.user.id),
    }
  },

  async getProfile(userId) {
    if (!userId) return null
    return profileWithInstitution(userId)
  },

  async signOut() {
    const { error } = await requireSupabase().auth.signOut()
    if (error) throw new Error(error.message)
  },

  async registerStudent(payload) {
    return signUp(payload.email, payload.password, {
      role: 'student',
      full_name: payload.full_name,
      school_code: payload.school_code,
      faculty_id: payload.faculty_id,
      department_id: payload.department_id,
      admission_year: payload.admission_year,
      serial_no: payload.serial_no,
      level: payload.level,
      phone: payload.phone,
    })
  },

  async registerInstructor(payload) {
    return signUp(payload.email, payload.password, {
      role: 'instructor',
      full_name: payload.full_name,
      school_code: payload.school_code,
      department_id: payload.department_id,
      phone: payload.phone,
    })
  },

  async registerInstitution(payload) {
    return signUp(payload.admin_email, payload.password, {
      role: 'admin',
      full_name: payload.admin_name,
      institution_name: payload.name,
      school_code: payload.school_code,
      location: payload.location,
      website: payload.website,
      faculty_name: payload.faculty_name,
      faculty_code: payload.faculty_code,
      department_name: payload.department_name,
      department_code: payload.department_code,
    })
  },
}

export const institutions = {
  async list() {
    const client = requireSupabase()
    const rows = throwIfError(await client.from('institutions')
      .select('*, users(role), faculties(id)')
      .order('name'))
    return rows.map((institution) => ({
      ...institution,
      student_count: institution.users.filter((user) => user.role === 'student').length,
      instructor_count: institution.users.filter((user) => user.role === 'instructor').length,
      faculty_count: institution.faculties.length,
    }))
  },

  async lookup(schoolCode) {
    const client = requireSupabase()
    const code = schoolCode.trim().toUpperCase()
    const institution = one(
      await client.from('institutions')
        .select('*')
        .eq('school_code', code)
        .maybeSingle(),
      `No institution found with school code "${code}"`,
    )
    const faculties = throwIfError(await client.from('faculties')
      .select('*, departments(*)')
      .eq('institution_id', institution.id)
      .order('name'))
    return { institution, faculties }
  },
}

const countRows = async (query) => {
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count || 0
}

export const admin = {
  async getOverview(institutionId) {
    const client = requireSupabase()
    const institution = one(
      await client.from('institutions').select('*').eq('id', institutionId).maybeSingle(),
      'Institution not found',
    )
    const [studentCount, instructorCount, facultyCount, departmentCount, manualCount, submissionCount, departments, users, recentStudents] = await Promise.all([
      countRows(client.from('users').select('id', { count: 'exact', head: true }).eq('institution_id', institutionId).eq('role', 'student')),
      countRows(client.from('users').select('id', { count: 'exact', head: true }).eq('institution_id', institutionId).eq('role', 'instructor')),
      countRows(client.from('faculties').select('id', { count: 'exact', head: true }).eq('institution_id', institutionId)),
      countRows(client.from('departments').select('id', { count: 'exact', head: true }).eq('institution_id', institutionId)),
      countRows(client.from('manuals').select('id', { count: 'exact', head: true }).eq('institution_id', institutionId)),
      countRows(client.from('task_submissions').select('id', { count: 'exact', head: true }).eq('institution_id', institutionId)),
      client.from('departments').select('id, name, code, faculty_id, faculties(name)').eq('institution_id', institutionId).order('name'),
      client.from('users').select('department_id, role').eq('institution_id', institutionId),
      client.from('users').select('id, full_name, email, matric_no, level, department, faculty, created_at')
        .eq('institution_id', institutionId).eq('role', 'student').order('created_at', { ascending: false }).limit(10),
    ])

    const departmentRows = throwIfError(departments)
    const institutionUsers = throwIfError(users)
    const departmentStats = departmentRows.map((department) => {
      const members = institutionUsers.filter((user) => user.department_id === department.id)
      return {
        ...department,
        faculty_name: department.faculties?.name || '',
        student_count: members.filter((user) => user.role === 'student').length,
        instructor_count: members.filter((user) => user.role === 'instructor').length,
      }
    })

    return {
      institution,
      counts: {
        student_count: studentCount,
        instructor_count: instructorCount,
        faculty_count: facultyCount,
        department_count: departmentCount,
        manual_count: manualCount,
        submission_count: submissionCount,
      },
      departmentStats,
      recentStudents: throwIfError(recentStudents),
    }
  },

  async getRoster(institutionId, role = '', departmentId = '') {
    const client = requireSupabase()
    let query = client.from('users')
      .select('id, email, role, full_name, matric_no, admission_year, serial_no, faculty, department, level, phone, created_at, department_id, faculty_id, departments(name), faculties(name)')
      .eq('institution_id', institutionId)
      .order('full_name')
    if (role) query = query.eq('role', role)
    if (departmentId) query = query.eq('department_id', departmentId)
    return throwIfError(await query).map((user) => ({
      ...user,
      department_name: user.departments?.name || '',
      faculty_name: user.faculties?.name || '',
    }))
  },

  async addFaculty(payload) {
    const client = requireSupabase()
    return one(await client.from('faculties').insert({
      institution_id: payload.institution_id,
      name: payload.name.trim(),
      code: payload.code.trim().toUpperCase(),
    }).select().single(), 'Could not create faculty.')
  },

  async addDepartment(payload) {
    const client = requireSupabase()
    return one(await client.from('departments').insert({
      institution_id: payload.institution_id,
      faculty_id: payload.faculty_id,
      name: payload.name.trim(),
      code: payload.code.trim().toUpperCase(),
    }).select().single(), 'Could not create department.')
  },
}

export const uploadPdf = async (file) => {
  const client = requireSupabase()
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError) throw new Error(userError.message)
  if (!user) throw new Error('Sign in to upload a manual PDF.')

  const path = `${user.id}/${crypto.randomUUID()}.pdf`
  const { data, error } = await client.storage.from('manuals').upload(path, file, {
    contentType: 'application/pdf',
    upsert: false,
  })
  if (error) throw new Error(error.message)
  const { data: { publicUrl } } = client.storage.from('manuals').getPublicUrl(data.path)
  return publicUrl
}

const manualWithCounts = (manual) => ({
  ...manual,
  task_count: manual.tasks?.[0]?.count || 0,
  enrollment_count: manual.manual_enrollments?.[0]?.count || 0,
})

export const listManualsForInstructor = async () => {
  const client = requireSupabase()
  const rows = throwIfError(await client.from('manuals')
    .select('*, tasks(count), manual_enrollments(count)')
    .order('created_at', { ascending: false }))
  return rows.map(manualWithCounts)
}

export const createManual = async (payload) => {
  const client = requireSupabase()
  return one(await client.from('manuals').insert({
    instructor_id: payload.instructor_id,
    course_code: payload.course_code,
    title: payload.title,
    description: payload.description || '',
    semester: payload.semester || null,
    manual_pdf_url: payload.manual_pdf_url || null,
    deadline: payload.deadline,
    published: Boolean(payload.published),
    import_batch_id: payload.import_batch_id || null,
  }).select().single(), 'Could not create manual.')
}

export const updateManual = async (manualId, patch) => {
  const client = requireSupabase()
  return one(await client.from('manuals').update(patch).eq('id', manualId).select().single(), 'Manual not found.')
}

export const deleteManual = async (manualId) => {
  const client = requireSupabase()
  throwIfError(await client.from('manuals').delete().eq('id', manualId))
  return { success: true }
}

export const getManualDetailForInstructor = async (manualId) => {
  const client = requireSupabase()
  const manual = one(await client.from('manuals').select('*').eq('id', manualId).maybeSingle(), 'Manual not found.')
  const tasks = throwIfError(await client.from('tasks').select('*').eq('manual_id', manualId).order('order_index'))
  return { manual, tasks }
}

export const upsertTasksForManual = async (manualId, tasks, deleteIds = []) => {
  const client = requireSupabase()
  const existing = throwIfError(await client.from('tasks').select('id, order_index').eq('manual_id', manualId))
  const records = tasks.map((task) => {
    const { _new, _dirty, ...record } = task
    return { ...record, manual_id: manualId }
  })
  const submittedIds = new Set(records.map((task) => task.id).filter(Boolean))
  const omittedIds = existing.filter((task) => !submittedIds.has(task.id)).map((task) => task.id)

  for (const [index, task] of existing.entries()) {
    const { error } = await client.from('tasks').update({ order_index: -(index + 1) }).eq('id', task.id)
    if (error) throw new Error(error.message)
  }

  if (records.length) {
    throwIfError(await client.from('tasks').upsert(records))
  }

  const removedIds = [...new Set([...omittedIds, ...deleteIds])]
  if (removedIds.length) {
    throwIfError(await client.from('tasks').delete().in('id', removedIds).eq('manual_id', manualId))
  }
  return throwIfError(await client.from('tasks').select('*').eq('manual_id', manualId).order('order_index'))
}

export const deleteTasksById = async (manualId, taskIds) => {
  if (!taskIds?.length) return
  const client = requireSupabase()
  throwIfError(await client.from('tasks').delete().eq('manual_id', manualId).in('id', taskIds))
}

export const getManualProgressRows = async (manualId, tasks) => {
  const client = requireSupabase()
  const manual = one(
    await client.from('manuals').select('id, deadline').eq('id', manualId).maybeSingle(),
    'Manual not found.',
  )
  const [submissions, enrollments] = await Promise.all([
    client.from('task_submissions').select('id, task_id, student_id, status, auto_passed, submitted_at').eq('manual_id', manualId),
    client.from('manual_enrollments').select('student_id').eq('manual_id', manualId),
  ])
  const submissionRows = throwIfError(submissions)
  const enrollmentRows = throwIfError(enrollments)
  const studentIds = [...new Set([
    ...submissionRows.map((row) => row.student_id),
    ...enrollmentRows.map((row) => row.student_id),
  ])]
  const profiles = studentIds.length
    ? throwIfError(await client.from('users')
      .select('id, full_name, email, matric_no, faculty, department, level')
      .in('id', studentIds))
    : []
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))

  return {
    manual,
    submissions: submissionRows.map((row) => ({
      ...row,
      ...Object.fromEntries(Object.entries(profileById.get(row.student_id) || {}).map(([key, value]) => [`student_${key}`, value])),
      student_profile_id: row.student_id,
    })),
    enrollments: enrollmentRows.map((row) => ({
      ...Object.fromEntries(Object.entries(profileById.get(row.student_id) || {}).map(([key, value]) => [`student_${key}`, value])),
      student_profile_id: row.student_id,
    })),
  }
}

export const listManualsForStudent = async () => {
  const client = requireSupabase()
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError) throw new Error(userError.message)
  if (!user) throw new Error('Sign in to view manuals.')
  const profile = await auth.getProfile(user.id)

  let query = client.from('manuals')
    .select('*, tasks(id, manual_id, order_index, title), manual_enrollments(student_id)')
    .eq('published', true)
    .order('created_at', { ascending: false })
  if (profile.institution_id) {
    query = query.or(`institution_id.eq.${profile.institution_id},institution_id.is.null`)
  }

  const manuals = throwIfError(await query)
  const manualIds = manuals.map((manual) => manual.id)
  const submissions = manualIds.length
    ? throwIfError(await client.from('task_submissions')
      .select('manual_id, task_id, status, auto_passed')
      .in('manual_id', manualIds)
      .eq('student_id', user.id))
    : []
  const submissionsByManual = new Map()
  for (const submission of submissions) {
    if (!submissionsByManual.has(submission.manual_id)) submissionsByManual.set(submission.manual_id, {})
    submissionsByManual.get(submission.manual_id)[submission.task_id] =
      submission.auto_passed && ['submitted', 'graded'].includes(submission.status) ? submission.status : 'in_progress'
  }

  return manuals.map((manual) => {
    const taskStatusMap = submissionsByManual.get(manual.id) || {}
    const submittedCount = manual.tasks.filter((task) => ['submitted', 'graded'].includes(taskStatusMap[task.id])).length
    return {
      ...manual,
      task_count: manual.tasks.length,
      submitted_count: submittedCount,
      progress_pct: manual.tasks.length ? Math.round((submittedCount / manual.tasks.length) * 100) : 0,
      enrolled: manual.manual_enrollments.some((enrollment) => enrollment.student_id === user.id),
      task_status_map: taskStatusMap,
    }
  })
}

export const enrollInManual = async (manualId) => {
  const client = requireSupabase()
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError) throw new Error(userError.message)
  if (!user) throw new Error('Sign in to enroll in a manual.')
  throwIfError(await client.from('manual_enrollments').upsert({
    manual_id: manualId,
    student_id: user.id,
  }, { onConflict: 'manual_id,student_id' }))
  return { success: true, manualId, studentId: user.id }
}

export const getManualForStudentWorkspace = async (manualId) => {
  const client = requireSupabase()
  const manual = one(
    await client.from('manuals').select('*').eq('id', manualId).eq('published', true).maybeSingle(),
    'Published manual not found.',
  )
  const tasks = throwIfError(await client.from('tasks').select('*').eq('manual_id', manualId).order('order_index'))
  return { manual, tasks }
}

export const listStudentSubmissionsForManual = async (manualId) => {
  const client = requireSupabase()
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError) throw new Error(userError.message)
  if (!user) throw new Error('Sign in to view your submissions.')
  const rows = throwIfError(await client.from('task_submissions')
    .select('*')
    .eq('manual_id', manualId)
    .eq('student_id', user.id))
  return Object.fromEntries(rows.map((row) => [row.task_id, row]))
}

export const upsertTaskSubmission = async (payload) => {
  const client = requireSupabase()
  const { data, error } = await client.rpc('save_task_submission', {
    p_task_id: payload.task_id,
    p_manual_id: payload.manual_id,
    p_code: payload.code || '',
    p_draft_code: payload.draft_code ?? null,
    p_submitted_at: payload.submitted_at || null,
    p_auto_passed: typeof payload.auto_passed === 'boolean' ? payload.auto_passed : null,
    p_run_output: payload.run_output ?? null,
    p_feedback: payload.feedback ?? null,
    p_status: payload.status || 'not_started',
  })
  if (error) throw new Error(error.message)
  return {
    ...data,
    auto_passed: data?.auto_passed === true || data?.auto_passed === 1,
  }
}
