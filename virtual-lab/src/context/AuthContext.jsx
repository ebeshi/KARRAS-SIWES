import { createContext, useContext, useEffect, useState } from 'react'
import { auth } from '../lib/api.js'

const AuthContext = createContext(null)
const STORAGE_KEY = 'vl_auth_session'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.user && parsed?.profile) {
          setUser(parsed.user)
          setProfile(parsed.profile)
        }
      }
    } catch (e) {
      console.warn('Failed to restore auth session:', e)
    } finally {
      if (mounted) setLoading(false)
    }
  }, [])

  const signIn = async (email, password) => {
    const res = await auth.signIn(email, password)
    setUser(res.user)
    setProfile(res.profile)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: res.user, profile: res.profile }))
    return res
  }

  const signOut = async () => {
    setUser(null)
    setProfile(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading, signIn, signOut,
      supabaseMissing: false,
      initError: null,
      hasClient: true,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
