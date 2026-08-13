import { useCallback, useEffect, useState } from 'react'
import { CustomerSessionContext } from './CustomerSessionContext'
import { leaveTableSession, updateTableSessionParticipant } from '../services/tableSessionService'
import { getCustomerSession } from '../services/customerApi'

// Shared-table mode deliberately keeps no customer token in browser storage.
// A fresh visit scans the table QR and receives the database-owned table session.
function saveSession() {}
function removeStoredSession() {}
function readStoredSession() { return null }

function CustomerSessionProvider({ children }) {
  const [session, setSession] = useState(readStoredSession)
  const [tableSession, setTableSession] = useState(null)
  const [sessionError, setSessionError] = useState('')

  const startSession = useCallback((tableNumber, customerNickname, tableSessionId, sessionId, memberId = '', isSharedTable = false) => {
    const nextSession = {
      tableNumber: String(tableNumber).trim(),
      customerNickname: String(customerNickname ?? '').trim() || 'Guest',
      sessionId,
      tableSessionId,
      ...(String(memberId ?? '').trim() ? { memberId: String(memberId).trim() } : {}),
      isSharedTable: Boolean(isSharedTable),
    }
    saveSession(nextSession)
    setSession(nextSession)
    setSessionError('')
    return nextSession
  }, [])

  const updateSessionNickname = useCallback(async (customerNickname) => {
    if (!session) throw new Error('Join an active table session before placing an order.')
    const normalizedNickname = String(customerNickname ?? '').trim() || 'Guest'
    if (normalizedNickname.length > 20) throw new Error('Your name must be 20 characters or fewer.')
    if (session.customerNickname === normalizedNickname) return session

    await updateTableSessionParticipant({ ...session, customerNickname: normalizedNickname })
    const nextSession = { ...session, customerNickname: normalizedNickname }
    saveSession(nextSession)
    setSession(nextSession)
    return nextSession
  }, [session])

  const clearSession = useCallback(async () => {
    const sessionToClear = session
    removeStoredSession()
    setSession(null)
    setTableSession(null)
    setSessionError('')

    try {
      if (sessionToClear?.tableSessionId && !sessionToClear.isSharedTable) await leaveTableSession(sessionToClear)
    } catch (error) {
      console.error('[Customer Session] Failed to leave table session:', error)
    }
  }, [session])

  const sessionId = session?.sessionId

  useEffect(() => {
    if (!sessionId) return () => {}
    let active = true
    const verify = async () => {
      try {
        const verified = await getCustomerSession(sessionId)
        if (!active) return
        setSession((current) => {
          if (!current) return current
          const nextSession = { ...current, ...verified }
          saveSession(nextSession)
          return nextSession
        })
        setTableSession({ id: verified.tableSessionId, status: 'active' })
        setSessionError('')
      } catch {
        if (!active) return
        removeStoredSession()
        setSession(null)
        setTableSession(null)
        setSessionError('Your previous table session has ended. Please scan the table QR code again.')
      }
    }
    void verify()
    const timer = window.setInterval(() => { void verify() }, 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [sessionId])

  return <CustomerSessionContext.Provider value={{ session, tableSession, sessionError, startSession, updateSessionNickname, clearSession }}>{children}</CustomerSessionContext.Provider>
}

export default CustomerSessionProvider
