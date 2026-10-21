import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute({ children, requiredRole }) {
  const { profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-center muted mb-0">Loading…</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (requiredRole && profile.role !== requiredRole) {
    const redirectTo = profile.role === 'admin' ? '/admin' : profile.role === 'instructor' ? '/instructor' : '/student'
    return <Navigate to={redirectTo} replace />
  }

  return children
}
