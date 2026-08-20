import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { apiRequest } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,setUser] = useState(null)
  const [loading,setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const result = await apiRequest('/v1/auth/me')
      setUser(result.user)
      return result.user
    } catch (error) {
      if (error.status === 401) setUser(null)
      else throw error
      return null
    }
  }, [])

  useEffect(() => {
    refreshUser().catch(()=>setUser(null)).finally(()=>setLoading(false))
    const clearSession = () => setUser(null)
    window.addEventListener('leaselock:unauthorized', clearSession)
    return () => window.removeEventListener('leaselock:unauthorized', clearSession)
  }, [refreshUser])

  const logout = useCallback(async () => {
    try { await apiRequest('/v1/auth/logout', { method:'POST' }) }
    finally { setUser(null) }
  }, [])

  return <AuthContext.Provider value={{user,loading,refreshUser,logout}}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}

function LoadingSession() {
  return <main id="main-content" className="auth-loading" aria-live="polite"><span className="spinner-border" aria-hidden="true"/><p>Checking your session…</p></main>
}

export function ProtectedRoute({ children, role }) {
  const {user,loading}=useAuth(); const location=useLocation()
  if (loading) return <LoadingSession/>
  if (!user) return <Navigate to="/login" replace state={{from:location.pathname,reason:'authentication-required'}}/>
  if (role && user.role !== role) return <Navigate to="/events" replace state={{reason:'forbidden'}}/>
  return children
}

export function GuestRoute({ children }) {
  const {user,loading}=useAuth()
  if (loading) return <LoadingSession/>
  if (user) return <Navigate to={user.role==='ADMIN'?'/admin':'/events'} replace/>
  return children
}
