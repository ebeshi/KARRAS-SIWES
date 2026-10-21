import { createContext, useContext, useEffect, useState } from 'react'
import { auth } from '../lib/api.js'
import { initError, supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return undefined
    }

    let active = true
    const loadProfile = async (sessionUser) => {
      if (!sessionUser) {
        if (active) {
          setUser(null)
          setProfile(null)
        }
        return
      }

      if (active) setUser(sessionUser)
      try {
        const nextProfile = await auth.getProfile(sessionUser.id)
        if (active) {
          setProfile(nextProfile)
          setSessionError(null)
        }
      } catch (error) {
        if (active) {
          setProfile(null)
          setSessionError(error.message || 'Could not load your account profile.')
        }
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null)
        setProfile(null)
        setLoading(false)
        return
      }
      queueMicrotask(() => loadProfile(session.user).finally(() => {
        if (active) setLoading(false)
      }))
    })

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error
        return loadProfile(data.session?.user || null)
      })
      .catch((error) => {
        if (active) setSessionError(error.message || 'Could not restore your session.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email, password) => {
    const result = await auth.signIn(email, password)
    setUser(result.user)
    setProfile(result.profile)
    setSessionError(null)
    return result
  }

  const setAuthSession = (nextUser, nextProfile) => {
    setUser(nextUser)
    setProfile(nextProfile)
    setSessionError(null)
  }

  const signOut = async () => {
    await auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      signIn,
      signOut,
      setAuthSession,
      supabaseMissing: !supabase,
      initError: initError || sessionError,
      hasClient: Boolean(supabase),
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
