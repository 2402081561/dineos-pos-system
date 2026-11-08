import { useCallback, useEffect, useRef, useState } from 'react'
import { CustomerSessionContext } from './CustomerSessionContext'
import { leaveTableSession, updateTableSessionParticipant } from '../services/tableSessionService'
import { getCustomerSession } from '../services/customerApi'
import { watchCustomerSession } from '../utils/customerSessionSubscription'
import { customerVisitStorage } from '../utils/customerVisitStorage'

// Cache the existing database-owned visit in this tab, not a new guest visit.
// A restored visit is verified by the API before protected ordering pages open.
const saveSession = (session) => customerVisitStorage.saveSession(session)
const removeStoredSession = () => customerVisitStorage.clearSession()
const readStoredSession = () => customerVisitStorage.readSession()

function CustomerSessionProvider({ children }) {
  const [session, setSession] = useState(readStoredSession)
  const [tableSession, setTableSession] = useState(null)
  const [sessionError, setSessionError] = useState('')
  const [isRestoring, setIsRestoring] = useState(Boolean(session))
  const [restoreError, setRestoreError] = useState('')
  const verification = useRef(null)
  const activeVisitId = useRef(session?.sessionId)
  const retryRestore = useCallback(() => { setRestoreError(''); return verification.current?.refresh() }, [])

  const startSession = useCallback((tableNumber, customerNickname, tableSessionId, sessionId, memberId = '', isSharedTable = false, options = {}) => {
    const nextSession = {
      tableNumber: options.isTakeawayQr ? null : String(tableNumber).trim(),
      customerNickname: String(customerNickname ?? '').trim() || 'Guest',
      sessionId,
      tableSessionId,
      ...(String(memberId ?? '').trim() ? { memberId: String(memberId).trim() } : {}),
      isSharedTable: Boolean(isSharedTable),
      ...(options.isTakeawayQr ? { isTakeawayQr: true, visitStatus: options.visitStatus ?? 'active' } : {}),
    }
    saveSession(nextSession)
    activeVisitId.current = sessionId
    setSession(nextSession)
    setIsRestoring(false)
    setRestoreError('')
    setSessionError('')
    return nextSession
  }, [])

  const updateSessionNickname = useCallback(async (customerNickname) => {
    if (!session) throw new Error('Join an active table session before placing an order.')
    const normalizedNickname = String(customerNickname ?? '').trim() || 'Guest'
    if (normalizedNickname.length > 80) throw new Error('Your name must be 80 characters or fewer.')
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
    activeVisitId.current = null
    setSession(null)
    setTableSession(null)
    setSessionError('')
    setIsRestoring(false)
    setRestoreError('')

    try {
      if (sessionToClear?.tableSessionId && !sessionToClear.isSharedTable) await leaveTableSession(sessionToClear)
    } catch (error) {
      console.error('[Customer Session] Failed to leave table session:', error)
    }
  }, [session])

  const sessionId = session?.sessionId
  const isTakeawayQr = session?.isTakeawayQr === true

  useEffect(() => {
    if (!sessionId) return () => {}
    const watcher = watchCustomerSession(() => getCustomerSession(sessionId), (verified) => {
      if (activeVisitId.current !== sessionId) return
      setSession((current) => {
        if (current?.sessionId !== sessionId) return current
        const nextSession = { ...current, ...verified }
        saveSession(nextSession)
        return nextSession
      })
      setTableSession({ id: verified.tableSessionId, status: verified.visitStatus ?? 'active' })
      setSessionError('')
      setIsRestoring(false)
      setRestoreError('')
    }, () => {
      if (activeVisitId.current !== sessionId) return
      activeVisitId.current = null
      removeStoredSession()
      setSession(null)
      setTableSession(null)
      setSessionError(isTakeawayQr ? 'Your take-away visit has ended. Open the take-away page to start again.' : 'Your previous table session has ended. Please scan the table QR code again.')
      setIsRestoring(false)
      setRestoreError('')
    }, { onUnavailable() { if (activeVisitId.current === sessionId) setRestoreError('We could not reconnect to your table. Your cart has been kept. Please try again.') } })
    verification.current = watcher
    return () => { watcher.stop(); verification.current = null }
  }, [sessionId, isTakeawayQr])

  return <CustomerSessionContext.Provider value={{ session, tableSession, sessionError, isRestoring, restoreError, retryRestore, startSession, updateSessionNickname, clearSession }}>{children}</CustomerSessionContext.Provider>
}

export default CustomerSessionProvider
