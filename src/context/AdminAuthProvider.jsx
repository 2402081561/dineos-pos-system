import { useEffect, useState } from 'react'
import { AdminAuthContext } from './AdminAuthContext'
import { restoreSupabaseUser, signInSupabaseUser, signOutSupabaseAdmin, subscribeToSupabaseSession } from '../services/supabaseAuthService'

function AdminAuthProvider({ children }) {
  const [adminUser, setAdminUser] = useState(null)
  const [authUser, setAuthUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let active = true
    let requestVersion = 0
    const unsubscribe = subscribeToSupabaseSession((session) => {
      const currentVersion = ++requestVersion
      if (!session) {
        if (active) { setAuthUser(null); setAdminUser(null); setAuthError(''); setIsLoading(false) }
        return
      }
      void restoreSupabaseUser(session)
        .then((user) => { if (active && currentVersion === requestVersion) { setAuthUser(user); setAdminUser(user?.role === 'admin' ? user : null); setAuthError('') } })
        .catch(() => { if (active && currentVersion === requestVersion) setAuthError('The server is temporarily unavailable. Your login session has been kept; try again shortly.') })
        .finally(() => { if (active && currentVersion === requestVersion) setIsLoading(false) })
    })
    return () => { active = false; unsubscribe() }
  }, [])

  async function signIn(email, password) {
    const user = await signInSupabaseUser(email, password)
    setAuthUser(user)
    setAdminUser(user.role === 'admin' ? user : null)
    setAuthError('')
    return user
  }

  async function signOut() {
    await signOutSupabaseAdmin()
    setAuthUser(null)
    setAdminUser(null)
  }

  return <AdminAuthContext.Provider value={{ adminUser, authError, authUser, isLoading, signIn, signOut }}>{children}</AdminAuthContext.Provider>
}

export default AdminAuthProvider
