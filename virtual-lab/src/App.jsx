import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import InstructorDashboard from './pages/InstructorDashboard.jsx'
import InstructorManualDetail from './pages/InstructorManualDetail.jsx'
import StudentDashboard from './pages/StudentDashboard.jsx'
import StudentManualWorkspace from './pages/StudentManualWorkspace.jsx'
import StudentAssignmentDetail from './pages/StudentAssignmentDetail.jsx'
import InstructorAssignmentDetail from './pages/InstructorAssignmentDetail.jsx'
import PyodideTest from './pages/PyodideTest.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'

function SetupBanner() {
  const { supabaseMissing, initError } = useAuth()
  if (!supabaseMissing) return null
  return (
    <div style={{
      background: 'rgba(251, 191, 36, 0.06)',
      color: '#fde68a',
      borderBottom: '1px solid rgba(251, 191, 36, 0.18)',
      padding: '12px 16px',
      fontSize: '0.9rem',
    }}>
      <strong>Supabase not configured.</strong> {initError}
      <div style={{ marginTop: 4, opacity: 0.85 }}>
        Edit <code>.env</code>, then restart the dev server.
      </div>
    </div>
  )
}

function Shell() {
  return (
    <div className="app">
      <SetupBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/pyodide-test" element={<PyodideTest />} />
        <Route path="/instructor" element={
          <ProtectedRoute requiredRole="instructor">
            <InstructorDashboard />
          </ProtectedRoute>
        } />
        <Route path="/instructor/manual/:id" element={
          <ProtectedRoute requiredRole="instructor">
            <InstructorManualDetail />
          </ProtectedRoute>
        } />
        <Route path="/instructor/assignment/:id" element={
          <ProtectedRoute requiredRole="instructor">
            <InstructorAssignmentDetail />
          </ProtectedRoute>
        } />
        <Route path="/student" element={
          <ProtectedRoute requiredRole="student">
            <StudentDashboard />
          </ProtectedRoute>
        } />
        <Route path="/student/manual/:id" element={
          <ProtectedRoute requiredRole="student">
            <StudentManualWorkspace />
          </ProtectedRoute>
        } />
        <Route path="/student/assignment/:id" element={
          <ProtectedRoute requiredRole="student">
            <StudentAssignmentDetail />
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}

export default App
