import { Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage.jsx'
import Login from './pages/Login.jsx'
import RegisterStudent from './pages/RegisterStudent.jsx'
import RegisterInstructor from './pages/RegisterInstructor.jsx'
import RegisterInstitution from './pages/RegisterInstitution.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import InstructorDashboard from './pages/InstructorDashboard.jsx'
import InstructorManualDetail from './pages/InstructorManualDetail.jsx'
import StudentDashboard from './pages/StudentDashboard.jsx'
import StudentManualWorkspace from './pages/StudentManualWorkspace.jsx'
import StudentAssignmentDetail from './pages/StudentAssignmentDetail.jsx'
import InstructorAssignmentDetail from './pages/InstructorAssignmentDetail.jsx'
import PyodideTest from './pages/PyodideTest.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

function Shell() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register/student" element={<RegisterStudent />} />
        <Route path="/register/instructor" element={<RegisterInstructor />} />
        <Route path="/register/institution" element={<RegisterInstitution />} />
        <Route path="/pyodide-test" element={<PyodideTest />} />

        {/* Institution Administrator Portal */}
        <Route path="/admin" element={
          <ProtectedRoute requiredRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        } />

        {/* Lecturer / Instructor Portal */}
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

        {/* Student Portal */}
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

        <Route path="*" element={<Navigate to="/" replace />} />
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
