import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { query, ensureSchema } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

// Serve uploaded PDF manuals as static files
app.use('/uploads', express.static(uploadsDir))

// Configure Multer for PDF file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  }
})
const upload = multer({ storage })

// Helper for dates in MySQL
function formatMySQLDate(val) {
  if (!val) return null
  const d = new Date(val)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

// ============================================================
// AUTH & USER ENDPOINTS
// ============================================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const rows = await query(`
      SELECT u.*, i.name as institution_name, i.school_code
      FROM users u
      LEFT JOIN institutions i ON u.institution_id = i.id
      WHERE LOWER(u.email) = ? LIMIT 1
    `, [email.trim().toLowerCase()])

    if (rows.length === 0) {
      return res.status(401).json({ error: 'User not found' })
    }

    const user = rows[0]
    // Simple password validation for demo/dev (in production, use bcrypt)
    if (password && user.password && user.password !== password) {
      return res.status(401).json({ error: 'Invalid password' })
    }

    // Return user profile without password
    const { password: _, ...userProfile } = user
    return res.json({
      user: { id: user.id, email: user.email },
      profile: userProfile,
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/auth/me/:userId', async (req, res) => {
  try {
    const rows = await query(`
      SELECT u.id, u.email, u.role, u.full_name, u.matric_no, u.admission_year, u.serial_no,
             u.faculty, u.department, u.level, u.phone, u.institution_id, u.faculty_id, u.department_id,
             i.name as institution_name, i.school_code
      FROM users u
      LEFT JOIN institutions i ON u.institution_id = i.id
      WHERE u.id = ? LIMIT 1
    `, [req.params.userId])

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ============================================================
// INSTITUTION & MULTI-TENANT ENDPOINTS
// ============================================================

// List institutions
app.get('/api/institutions', async (req, res) => {
  try {
    const rows = await query(`
      SELECT i.*,
        (SELECT COUNT(*) FROM users u WHERE u.institution_id = i.id AND u.role = 'student') as student_count,
        (SELECT COUNT(*) FROM users u WHERE u.institution_id = i.id AND u.role = 'instructor') as instructor_count,
        (SELECT COUNT(*) FROM faculties f WHERE f.institution_id = i.id) as faculty_count
      FROM institutions i
      ORDER BY i.name ASC
    `)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Lookup institution by school code with all its faculties and departments
app.get('/api/institutions/lookup/:schoolCode', async (req, res) => {
  try {
    const code = req.params.schoolCode.trim().toUpperCase()
    const instRows = await query('SELECT * FROM institutions WHERE UPPER(school_code) = ? LIMIT 1', [code])
    if (instRows.length === 0) {
      return res.status(404).json({ error: `No institution found with school code "${code}"` })
    }

    const inst = instRows[0]
    const faculties = await query('SELECT * FROM faculties WHERE institution_id = ? ORDER BY name ASC', [inst.id])
    const departments = await query('SELECT * FROM departments WHERE institution_id = ? ORDER BY name ASC', [inst.id])

    const facWithDepts = faculties.map(f => ({
      ...f,
      departments: departments.filter(d => d.faculty_id === f.id)
    }))

    res.json({
      institution: inst,
      faculties: facWithDepts
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Register Student
app.post('/api/auth/register-student', async (req, res) => {
  try {
    const { full_name, email, password, school_code, department_id, admission_year, serial_no, level, phone } = req.body
    if (!full_name || !email || !password || !school_code || !department_id) {
      return res.status(400).json({ error: 'Please provide full name, email, password, school code, and department.' })
    }

    const cleanEmail = email.trim().toLowerCase()
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [cleanEmail])
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    // Find institution
    const instRows = await query('SELECT id, name, school_code FROM institutions WHERE UPPER(school_code) = ? LIMIT 1', [school_code.trim().toUpperCase()])
    if (instRows.length === 0) {
      return res.status(404).json({ error: `School code "${school_code}" does not exist` })
    }
    const inst = instRows[0]

    // Find department & faculty
    const deptRows = await query(`
      SELECT d.id as dept_id, d.name as dept_name, d.code as dept_code,
             f.id as fac_id, f.name as fac_name, f.code as fac_code
      FROM departments d
      JOIN faculties f ON d.faculty_id = f.id
      WHERE d.id = ? AND d.institution_id = ? LIMIT 1
    `, [department_id, inst.id])

    if (deptRows.length === 0) {
      return res.status(400).json({ error: 'Selected department does not exist in this institution' })
    }
    const { dept_id, dept_name, dept_code, fac_id, fac_name, fac_code } = deptRows[0]

    // Format matric: e.g. 2023/CP/CSC/0016
    const cleanYear = admission_year ? String(admission_year).trim() : new Date().getFullYear().toString()
    const cleanSerial = serial_no ? String(serial_no).trim().padStart(4, '0') : Math.floor(1000 + Math.random() * 9000).toString()
    const matricNo = `${cleanYear}/${fac_code}/${dept_code}/${cleanSerial}`

    // Check matric uniqueness
    const dupMatric = await query('SELECT id FROM users WHERE matric_no = ? LIMIT 1', [matricNo])
    if (dupMatric.length > 0) {
      return res.status(409).json({ error: `Matriculation number ${matricNo} is already registered.` })
    }

    const userId = `u-stud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    await query(`
      INSERT INTO users (id, email, password, role, full_name, institution_id, faculty_id, department_id, faculty, department, matric_no, admission_year, serial_no, level, phone)
      VALUES (?, ?, ?, 'student', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId, cleanEmail, password, full_name.trim(), inst.id, fac_id, dept_id, fac_name, dept_name,
      matricNo, parseInt(cleanYear, 10), cleanSerial, level ? parseInt(level, 10) : 100, phone || null
    ])

    const userProfile = {
      id: userId,
      email: cleanEmail,
      role: 'student',
      full_name: full_name.trim(),
      matric_no: matricNo,
      institution_id: inst.id,
      institution_name: inst.name,
      school_code: inst.school_code,
      faculty: fac_name,
      department: dept_name,
      level: level ? parseInt(level, 10) : 100,
      phone: phone || null,
    }

    res.json({
      user: { id: userId, email: cleanEmail },
      profile: userProfile
    })
  } catch (err) {
    console.error('Register student error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Register Instructor
app.post('/api/auth/register-instructor', async (req, res) => {
  try {
    const { full_name, email, password, school_code, department_id, phone } = req.body
    if (!full_name || !email || !password || !school_code || !department_id) {
      return res.status(400).json({ error: 'Please provide full name, email, password, school code, and department.' })
    }

    const cleanEmail = email.trim().toLowerCase()
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [cleanEmail])
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    const instRows = await query('SELECT id, name, school_code FROM institutions WHERE UPPER(school_code) = ? LIMIT 1', [school_code.trim().toUpperCase()])
    if (instRows.length === 0) {
      return res.status(404).json({ error: `School code "${school_code}" does not exist` })
    }
    const inst = instRows[0]

    const deptRows = await query(`
      SELECT d.id as dept_id, d.name as dept_name,
             f.id as fac_id, f.name as fac_name
      FROM departments d
      JOIN faculties f ON d.faculty_id = f.id
      WHERE d.id = ? AND d.institution_id = ? LIMIT 1
    `, [department_id, inst.id])

    if (deptRows.length === 0) {
      return res.status(400).json({ error: 'Selected department does not exist in this institution' })
    }
    const { dept_id, dept_name, fac_id, fac_name } = deptRows[0]

    const userId = `u-inst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    await query(`
      INSERT INTO users (id, email, password, role, full_name, institution_id, faculty_id, department_id, faculty, department, phone)
      VALUES (?, ?, ?, 'instructor', ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId, cleanEmail, password, full_name.trim(), inst.id, fac_id, dept_id, fac_name, dept_name, phone || null
    ])

    const userProfile = {
      id: userId,
      email: cleanEmail,
      role: 'instructor',
      full_name: full_name.trim(),
      institution_id: inst.id,
      institution_name: inst.name,
      school_code: inst.school_code,
      faculty: fac_name,
      department: dept_name,
      phone: phone || null,
    }

    res.json({
      user: { id: userId, email: cleanEmail },
      profile: userProfile
    })
  } catch (err) {
    console.error('Register instructor error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Register Institution (creates institution + faculty + dept + admin account)
app.post('/api/auth/register-institution', async (req, res) => {
  try {
    const {
      name, school_code, location, website,
      admin_name, admin_email, password,
      faculty_name, faculty_code, department_name, department_code
    } = req.body

    if (!name || !school_code || !admin_name || !admin_email || !password) {
      return res.status(400).json({ error: 'School name, school code, admin name, admin email, and password are required' })
    }

    const cleanCode = school_code.trim().toUpperCase()
    const codeDup = await query('SELECT id FROM institutions WHERE UPPER(school_code) = ? LIMIT 1', [cleanCode])
    if (codeDup.length > 0) {
      return res.status(409).json({ error: `School code "${cleanCode}" is already taken. Please choose another.` })
    }

    const cleanEmail = admin_email.trim().toLowerCase()
    const emailDup = await query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [cleanEmail])
    if (emailDup.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    const instId = `inst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    await query(`
      INSERT INTO institutions (id, name, school_code, location, website)
      VALUES (?, ?, ?, ?, ?)
    `, [instId, name.trim(), cleanCode, location?.trim() || null, website?.trim() || null])

    // Create initial faculty & department
    const facName = faculty_name?.trim() || 'Faculty of Computing'
    const facCode = (faculty_code?.trim() || 'CP').toUpperCase()
    const facId = `fac-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    await query(`
      INSERT INTO faculties (id, institution_id, name, code)
      VALUES (?, ?, ?, ?)
    `, [facId, instId, facName, facCode])

    const deptName = department_name?.trim() || 'Computer Science'
    const deptCode = (department_code?.trim() || 'CSC').toUpperCase()
    const deptId = `dept-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    await query(`
      INSERT INTO departments (id, institution_id, faculty_id, name, code)
      VALUES (?, ?, ?, ?, ?)
    `, [deptId, instId, facId, deptName, deptCode])

    // Create Admin User
    const adminId = `u-admin-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    await query(`
      INSERT INTO users (id, email, password, role, full_name, institution_id, faculty_id, department_id, faculty, department)
      VALUES (?, ?, ?, 'admin', ?, ?, ?, ?, ?, ?)
    `, [adminId, cleanEmail, password, admin_name.trim(), instId, facId, deptId, facName, deptName])

    const userProfile = {
      id: adminId,
      email: cleanEmail,
      role: 'admin',
      full_name: admin_name.trim(),
      institution_id: instId,
      institution_name: name.trim(),
      school_code: cleanCode,
      faculty: facName,
      department: deptName,
    }

    res.json({
      user: { id: adminId, email: cleanEmail },
      profile: userProfile,
      institution: { id: instId, name: name.trim(), school_code: cleanCode }
    })
  } catch (err) {
    console.error('Register institution error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ============================================================
// ADMIN PORTAL ENDPOINTS
// ============================================================

// Institution overview & analytics
app.get('/api/admin/overview', async (req, res) => {
  try {
    const { institutionId } = req.query
    if (!institutionId) return res.status(400).json({ error: 'institutionId is required' })

    const [inst] = await query('SELECT * FROM institutions WHERE id = ?', [institutionId])
    if (!inst) return res.status(404).json({ error: 'Institution not found' })

    // Summary counts
    const [counts] = await query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE institution_id = ? AND role = 'student') as student_count,
        (SELECT COUNT(*) FROM users WHERE institution_id = ? AND role = 'instructor') as instructor_count,
        (SELECT COUNT(*) FROM faculties WHERE institution_id = ?) as faculty_count,
        (SELECT COUNT(*) FROM departments WHERE institution_id = ?) as department_count,
        (SELECT COUNT(*) FROM manuals WHERE instructor_id IN (SELECT id FROM users WHERE institution_id = ?)) as manual_count,
        (SELECT COUNT(*) FROM task_submissions WHERE student_id IN (SELECT id FROM users WHERE institution_id = ?)) as submission_count
    `, [institutionId, institutionId, institutionId, institutionId, institutionId, institutionId])

    // Breakdown by department
    const deptStats = await query(`
      SELECT d.id, d.name, d.code, f.name as faculty_name,
        (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role = 'student') as student_count,
        (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role = 'instructor') as instructor_count
      FROM departments d
      JOIN faculties f ON d.faculty_id = f.id
      WHERE d.institution_id = ?
      ORDER BY d.name ASC
    `, [institutionId])

    // Recent students
    const recentStudents = await query(`
      SELECT id, full_name, email, matric_no, level, department, faculty, created_at
      FROM users
      WHERE institution_id = ? AND role = 'student'
      ORDER BY created_at DESC LIMIT 10
    `, [institutionId])

    res.json({
      institution: inst,
      counts: counts || {},
      departmentStats: deptStats || [],
      recentStudents: recentStudents || []
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Admin Roster (list students/instructors)
app.get('/api/admin/roster', async (req, res) => {
  try {
    const { institutionId, role, departmentId } = req.query
    if (!institutionId) return res.status(400).json({ error: 'institutionId is required' })

    let sql = `
      SELECT u.id, u.email, u.role, u.full_name, u.matric_no, u.admission_year, u.serial_no,
             u.faculty, u.department, u.level, u.phone, u.created_at,
             d.name as department_name, f.name as faculty_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN faculties f ON u.faculty_id = f.id
      WHERE u.institution_id = ?
    `
    const params = [institutionId]

    if (role) {
      sql += ' AND u.role = ?'
      params.push(role)
    }
    if (departmentId) {
      sql += ' AND u.department_id = ?'
      params.push(departmentId)
    }

    sql += ' ORDER BY u.full_name ASC'
    const users = await query(sql, params)
    res.json(users)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Admin Add Faculty
app.post('/api/admin/faculties', async (req, res) => {
  try {
    const { institution_id, name, code } = req.body
    if (!institution_id || !name || !code) {
      return res.status(400).json({ error: 'institution_id, faculty name, and code are required' })
    }
    const facId = `fac-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    await query(`
      INSERT INTO faculties (id, institution_id, name, code)
      VALUES (?, ?, ?, ?)
    `, [facId, institution_id, name.trim(), code.trim().toUpperCase()])

    const [created] = await query('SELECT * FROM faculties WHERE id = ?', [facId])
    res.json(created)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Admin Add Department
app.post('/api/admin/departments', async (req, res) => {
  try {
    const { institution_id, faculty_id, name, code } = req.body
    if (!institution_id || !faculty_id || !name || !code) {
      return res.status(400).json({ error: 'institution_id, faculty_id, department name, and code are required' })
    }
    const deptId = `dept-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    await query(`
      INSERT INTO departments (id, institution_id, faculty_id, name, code)
      VALUES (?, ?, ?, ?, ?)
    `, [deptId, institution_id, faculty_id, name.trim(), code.trim().toUpperCase()])

    const [created] = await query('SELECT * FROM departments WHERE id = ?', [deptId])
    res.json(created)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ============================================================
// FILE UPLOAD ENDPOINT
// ============================================================

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }
  const fileUrl = `/uploads/${req.file.filename}`
  res.json({ url: fileUrl })
})

// ============================================================
// INSTRUCTOR MANUALS & TASKS ENDPOINTS
// ============================================================

app.get('/api/instructor/manuals', async (req, res) => {
  try {
    const { instructorId } = req.query
    let sql = `
      SELECT m.*, 
        (SELECT COUNT(*) FROM tasks t WHERE t.manual_id = m.id) AS task_count,
        (SELECT COUNT(*) FROM manual_enrollments e WHERE e.manual_id = m.id) AS enrollment_count
      FROM manuals m
    `
    const params = []
    if (instructorId) {
      sql += ' WHERE m.instructor_id = ?'
      params.push(instructorId)
    }
    sql += ' ORDER BY m.created_at DESC'
    const manuals = await query(sql, params)
    res.json(manuals)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/instructor/manuals', async (req, res) => {
  try {
    const { id, instructor_id, course_code, title, description, semester, manual_pdf_url, deadline, published, import_batch_id } = req.body
    const manualId = id || `m-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    
    // Look up instructor's institution_id for multi-tenant isolation
    const [instRow] = await query('SELECT institution_id FROM users WHERE id = ? LIMIT 1', [instructor_id])
    const institutionId = req.body.institution_id || instRow?.institution_id || null

    await query(
      `INSERT INTO manuals (id, instructor_id, institution_id, course_code, title, description, semester, manual_pdf_url, deadline, published, import_batch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        manualId,
        instructor_id,
        institutionId,
        course_code,
        title,
        description || '',
        semester || null,
        manual_pdf_url || null,
        formatMySQLDate(deadline),
        published ? 1 : 0,
        import_batch_id || null
      ]
    )

    const [created] = await query('SELECT * FROM manuals WHERE id = ?', [manualId])
    res.json(created)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/instructor/manuals/:id', async (req, res) => {
  try {
    const manualId = req.params.id
    const fields = { ...req.body }
    if (fields.deadline) {
      fields.deadline = formatMySQLDate(fields.deadline)
    }
    delete fields.id
    
    const keys = Object.keys(fields)
    if (keys.length === 0) return res.json({ success: true })

    const setClause = keys.map(k => `\`${k}\` = ?`).join(', ')
    const values = keys.map(k => fields[k])
    values.push(manualId)

    await query(`UPDATE manuals SET ${setClause} WHERE id = ?`, values)
    const [updated] = await query('SELECT * FROM manuals WHERE id = ?', [manualId])
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/instructor/manuals/:id', async (req, res) => {
  try {
    await query('DELETE FROM manuals WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/instructor/manuals/:id', async (req, res) => {
  try {
    const { id } = req.params
    const manuals = await query('SELECT * FROM manuals WHERE id = ?', [id])
    if (manuals.length === 0) return res.status(404).json({ error: 'Manual not found' })
    
    const tasks = await query('SELECT * FROM tasks WHERE manual_id = ? ORDER BY order_index ASC', [id])
    res.json({ manual: manuals[0], tasks })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/instructor/manuals/:id/tasks', async (req, res) => {
  try {
    const manualId = req.params.id
    const { tasks, deleteIds } = req.body

    if (Array.isArray(deleteIds) && deleteIds.length > 0) {
      const placeholders = deleteIds.map(() => '?').join(',')
      await query(`DELETE FROM tasks WHERE id IN (${placeholders})`, deleteIds)
    }

    if (Array.isArray(tasks)) {
      for (const t of tasks) {
        const taskId = t.id || `t-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
        await query(
          `INSERT INTO tasks (id, manual_id, order_index, title, instruction_text, pdf_section_label, pdf_page_start, pdf_page_end, language, starter_code, expected_output, points)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           order_index = VALUES(order_index),
           title = VALUES(title),
           instruction_text = VALUES(instruction_text),
           pdf_section_label = VALUES(pdf_section_label),
           pdf_page_start = VALUES(pdf_page_start),
           pdf_page_end = VALUES(pdf_page_end),
           language = VALUES(language),
           starter_code = VALUES(starter_code),
           expected_output = VALUES(expected_output),
           points = VALUES(points)`,
          [
            taskId,
            manualId,
            t.order_index || 1,
            t.title || 'Untitled Task',
            t.instruction_text || '',
            t.pdf_section_label || null,
            t.pdf_page_start || null,
            t.pdf_page_end || null,
            t.language || 'python',
            t.starter_code || '',
            t.expected_output || null,
            0
          ]
        )
      }
    }

    const updatedTasks = await query('SELECT * FROM tasks WHERE manual_id = ? ORDER BY order_index ASC', [manualId])
    res.json(updatedTasks)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/instructor/manuals/:id/progress', async (req, res) => {
  try {
    const manualId = req.params.id
    const [manual] = await query('SELECT id, deadline FROM manuals WHERE id = ?', [manualId])
    if (!manual) return res.status(404).json({ error: 'Manual not found' })

    const submissions = await query(
      `SELECT ts.id, ts.task_id, ts.student_id, ts.status, ts.auto_passed, ts.submitted_at,
              u.id AS student_profile_id, u.full_name AS student_full_name,
              u.email AS student_email, u.matric_no AS student_matric_no,
              u.faculty AS student_faculty, u.department AS student_department,
              u.level AS student_level
       FROM task_submissions ts
       JOIN users u ON ts.student_id = u.id
       WHERE ts.manual_id = ?`,
      [manualId]
    )

    const enrollments = await query(
      `SELECT me.student_id, u.id AS student_profile_id,
              u.full_name AS student_full_name, u.email AS student_email,
              u.matric_no AS student_matric_no, u.faculty AS student_faculty,
              u.department AS student_department, u.level AS student_level
       FROM manual_enrollments me
       JOIN users u ON me.student_id = u.id
       WHERE me.manual_id = ?`,
      [manualId]
    )

    res.json({ manual, submissions, enrollments })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ============================================================
// STUDENT ENDPOINTS
// ============================================================

app.get('/api/student/manuals', async (req, res) => {
  try {
    const { studentId } = req.query

    let sql = 'SELECT m.* FROM manuals m WHERE m.published = 1'
    const sqlParams = []

    if (studentId) {
      const [studentRow] = await query('SELECT institution_id FROM users WHERE id = ? LIMIT 1', [studentId])
      const studentInstId = studentRow?.institution_id || null
      if (studentInstId) {
        sql += ' AND (m.institution_id = ? OR m.institution_id IS NULL)'
        sqlParams.push(studentInstId)
      }
    }

    sql += ' ORDER BY m.created_at DESC'
    const manuals = await query(sql, sqlParams)

    let enrolledSet = new Set()
    let submissionsMap = {}

    if (studentId) {
      const enrollments = await query('SELECT manual_id FROM manual_enrollments WHERE student_id = ?', [studentId])
      enrolledSet = new Set(enrollments.map(e => e.manual_id))

      const submissions = await query('SELECT manual_id, task_id, status, auto_passed FROM task_submissions WHERE student_id = ?', [studentId])
      for (const s of submissions) {
        if (!submissionsMap[s.manual_id]) submissionsMap[s.manual_id] = {}
        submissionsMap[s.manual_id][s.task_id] = s.auto_passed === 1 || s.auto_passed === true ? s.status : 'in_progress'
      }
    }

    const manualIds = manuals.map(m => m.id)
    let allTasks = []
    if (manualIds.length > 0) {
      const placeholders = manualIds.map(() => '?').join(',')
      allTasks = await query(`SELECT id, manual_id, order_index, title FROM tasks WHERE manual_id IN (${placeholders}) ORDER BY order_index ASC`, manualIds)
    }

    const tasksByManual = {}
    for (const t of allTasks) {
      if (!tasksByManual[t.manual_id]) tasksByManual[t.manual_id] = []
      tasksByManual[t.manual_id].push(t)
    }

    const result = manuals.map(m => {
      const tasks = tasksByManual[m.id] || []
      const total = tasks.length
      const statusMap = submissionsMap[m.id] || {}
      const done = tasks.reduce((acc, t) => acc + (['submitted', 'graded'].includes(statusMap[t.id]) ? 1 : 0), 0)

      return {
        ...m,
        tasks,
        task_count: total,
        submitted_count: done,
        progress_pct: total ? Math.round((done / total) * 100) : 0,
        enrolled: enrolledSet.has(m.id),
        task_status_map: statusMap
      }
    })

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/student/enroll', async (req, res) => {
  try {
    const { manualId, studentId } = req.body
    if (!manualId || !studentId) return res.status(400).json({ error: 'manualId and studentId are required' })

    const id = `enr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    await query(
      `INSERT INTO manual_enrollments (id, manual_id, student_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE joined_at = CURRENT_TIMESTAMP`,
      [id, manualId, studentId]
    )

    res.json({ success: true, manualId, studentId })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/student/manuals/:id', async (req, res) => {
  try {
    const { id } = req.params
    const manuals = await query('SELECT * FROM manuals WHERE id = ? AND published = 1', [id])
    if (manuals.length === 0) return res.status(404).json({ error: 'Published manual not found' })

    const tasks = await query('SELECT * FROM tasks WHERE manual_id = ? ORDER BY order_index ASC', [id])
    res.json({ manual: manuals[0], tasks })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/student/submissions', async (req, res) => {
  try {
    const { manualId, studentId } = req.query
    const submissions = await query(
      'SELECT * FROM task_submissions WHERE manual_id = ? AND student_id = ?',
      [manualId, studentId]
    )
    res.json(submissions)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/student/submissions', async (req, res) => {
  try {
    const { task_id, student_id, manual_id, code, draft_code, submitted_at, auto_passed, run_output, feedback, status } = req.body
    const subId = req.body.id || `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const [existing] = await query(
      'SELECT * FROM task_submissions WHERE task_id = ? AND student_id = ?',
      [task_id, student_id]
    )

    if (existing && ['submitted', 'graded'].includes(existing.status) && (existing.auto_passed === 1 || existing.auto_passed === true)) {
      return res.json({
        ...existing,
        auto_passed: true,
      })
    }

    if (['submitted', 'graded'].includes(status)) {
      const [task] = await query(
        `SELECT t.expected_output, (m.deadline <= CURRENT_TIMESTAMP) AS deadline_elapsed
         FROM tasks t
         JOIN manuals m ON m.id = t.manual_id
         WHERE t.id = ? AND t.manual_id = ?`,
        [task_id, manual_id]
      )
      if (!task) return res.status(404).json({ error: 'Task not found for this manual' })
      if (task.deadline_elapsed) return res.status(400).json({ error: 'The submission deadline has passed' })
      if (!String(code || '').trim()) return res.status(400).json({ error: 'An answer is required before submitting' })
      const hasExpected = String(task.expected_output || '').trim().length > 0
      if (hasExpected) {
        const normalizeOutput = (value) => String(value || '').trim().replace(/\r\n/g, '\n')
        if (auto_passed !== true || normalizeOutput(run_output) !== normalizeOutput(task.expected_output)) {
          return res.status(400).json({ error: 'The answer must run and match the expected output before it can be submitted' })
        }
      }
    }

    await query(
      `INSERT INTO task_submissions (id, task_id, student_id, manual_id, code, draft_code, submitted_at, auto_passed, run_output, grade, feedback, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       code = VALUES(code),
       draft_code = VALUES(draft_code),
       submitted_at = VALUES(submitted_at),
       auto_passed = VALUES(auto_passed),
       run_output = VALUES(run_output),
       grade = VALUES(grade),
       feedback = VALUES(feedback),
       status = VALUES(status)`,
      [
        subId,
        task_id,
        student_id,
        manual_id,
        code || '',
        draft_code || null,
        formatMySQLDate(submitted_at),
        typeof auto_passed === 'boolean' ? (auto_passed ? 1 : 0) : null,
        run_output || null,
        null,
        feedback || null,
        status || 'not_started'
      ]
    )

    const [saved] = await query('SELECT * FROM task_submissions WHERE task_id = ? AND student_id = ?', [task_id, student_id])
    res.json({
      ...saved,
      auto_passed: saved ? (saved.auto_passed === 1 || saved.auto_passed === true) : (auto_passed === true)
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Start server after ensuring schema
ensureSchema().finally(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Virtual Lab Express Server listening on http://localhost:${PORT}`)
  })
})
