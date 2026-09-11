import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { query } from './db.js'

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

// ============================================================
// AUTH ENDPOINTS
// ============================================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const rows = await query('SELECT * FROM users WHERE email = ? LIMIT 1', [email.trim()])
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
    const rows = await query('SELECT id, email, role, full_name, matric_no, faculty, department, level, phone FROM users WHERE id = ? LIMIT 1', [req.params.userId])
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(rows[0])
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
    
    await query(
      `INSERT INTO manuals (id, instructor_id, course_code, title, description, semester, manual_pdf_url, deadline, published, import_batch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        manualId,
        instructor_id,
        course_code,
        title,
        description || '',
        semester || null,
        manual_pdf_url || null,
        deadline,
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
    const fields = req.body
    const keys = Object.keys(fields).filter(k => k !== 'id')
    
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
            t.points || 10
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
    const submissions = await query(
      `SELECT ts.*, u.full_name, u.email, u.matric_no, u.faculty, u.department, u.level
       FROM task_submissions ts
       JOIN users u ON ts.student_id = u.id
       WHERE ts.manual_id = ?`,
      [manualId]
    )

    const enrollments = await query(
      `SELECT me.student_id, u.full_name, u.email, u.matric_no, u.faculty, u.department, u.level
       FROM manual_enrollments me
       JOIN users u ON me.student_id = u.id
       WHERE me.manual_id = ?`,
      [manualId]
    )

    res.json({ submissions, enrollments })
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

    const manuals = await query(
      `SELECT m.* FROM manuals m WHERE m.published = 1 ORDER BY m.created_at DESC`
    )

    let enrolledSet = new Set()
    let submissionsMap = {}

    if (studentId) {
      const enrollments = await query('SELECT manual_id FROM manual_enrollments WHERE student_id = ?', [studentId])
      enrolledSet = new Set(enrollments.map(e => e.manual_id))

      const submissions = await query('SELECT manual_id, task_id, status FROM task_submissions WHERE student_id = ?', [studentId])
      for (const s of submissions) {
        if (!submissionsMap[s.manual_id]) submissionsMap[s.manual_id] = {}
        submissionsMap[s.manual_id][s.task_id] = s.status
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
    const { task_id, student_id, manual_id, code, draft_code, submitted_at, auto_passed, run_output, grade, feedback, status } = req.body
    const subId = req.body.id || `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`

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
        submitted_at || null,
        typeof auto_passed === 'boolean' ? (auto_passed ? 1 : 0) : null,
        run_output || null,
        typeof grade === 'number' ? grade : null,
        feedback || null,
        status || 'not_started'
      ]
    )

    const [saved] = await query('SELECT * FROM task_submissions WHERE task_id = ? AND student_id = ?', [task_id, student_id])
    res.json(saved)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Virtual Lab Express Server listening on http://localhost:${PORT}`)
})
