import { useEffect, useState } from 'react'
import { AdminAuthContext } from './AdminAuthContext'
import { restoreSupabaseUser, signInSupabaseUser, signOutSupabaseAdmin, subscribeToSupabaseSession } from '../services/supabaseAuthService'
import { recoverStaffSession } from '../utils/staffSessionRecovery'
import { authenticatedApiRequest } from '../services/supabaseAuthService'
import { disableOrderNotifications } from '../utils/orderNotifications'

function AdminAuthProvider({ children }) {
  const [adminUser, setAdminUser] = useState(null)
  const [authUser, setAuthUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let active = true
    let requestVersion = 0
    let recovery
    const unsubscribe = subscribeToSupabaseSession((session) => {
      const currentVersion = ++requestVersion
      recovery?.stop()
      if (!session) {
        if (active) { setAuthUser(null); setAdminUser(null); setAuthError(''); setIsLoading(false) }
        return
      }
      recovery = recoverStaffSession(() => restoreSupabaseUser(session),
        (user) => { if (active && currentVersion === requestVersion) { setAuthUser(user); setAdminUser(user?.role === 'admin' ? user : null); setAuthError(''); setIsLoading(false) } },
        () => { if (active && currentVersion === requestVersion) { setAuthError('The server is temporarily unavailable. Your login session has been kept; try again shortly.'); setIsLoading(false) } },
        () => { if (active && currentVersion === requestVersion) { setAuthUser(null); setAdminUser(null); setAuthError(''); setIsLoading(false) } },
      )
    })
    return () => { active = false; recovery?.stop(); unsubscribe() }
  }, [])

  async function signIn(email, password) {
    const user = await signInSupabaseUser(email, password)
    setAuthUser(user)
    setAdminUser(user.role === 'admin' ? user : null)
    setAuthError('')
    return user
  }

  async function signOut() {
    await disableOrderNotifications(authenticatedApiRequest, authUser?.id)
    await signOutSupabaseAdmin()
    setAuthUser(null)
    setAdminUser(null)
  }

  return <AdminAuthContext.Provider value={{ adminUser, authError, authUser, isLoading, signIn, signOut }}>{children}</AdminAuthContext.Provider>
}

export default AdminAuthProvider
