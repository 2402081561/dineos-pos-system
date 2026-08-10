import { useCallback, useEffect, useState } from 'react'
import { CustomerSessionContext } from './CustomerSessionContext'
import { leaveTableSession, subscribeToTableSession } from '../services/tableSessionService'
import { createSessionId } from '../utils/session'

const sessionStorageKey = 'dineos.customerSession'

function readStoredSession() {
  try {
    const savedSession = localStorage.getItem(sessionStorageKey)
    if (!savedSession) return null

    const parsedSession = JSON.parse(savedSession)
    const isValidSession = parsedSession
      && typeof parsedSession === 'object'
      && String(parsedSession.tableNumber ?? '').trim()
      && String(parsedSession.customerNickname ?? '').trim()
      && String(parsedSession.sessionId ?? '').trim()
      && String(parsedSession.tableSessionId ?? '').trim()

    if (isValidSession) return parsedSession
    localStorage.removeItem(sessionStorageKey)
    return null
  } catch {
    localStorage.removeItem(sessionStorageKey)
    return null
  }
}

function CustomerSessionProvider({ children }) {
  const [session, setSession] = useState(readStoredSession)
  const [tableSession, setTableSession] = useState(null)
  const [sessionError, setSessionError] = useState('')

  const startSession = useCallback((tableNumber, customerNickname, tableSessionId, sessionId = createSessionId()) => {
    const nextSession = {
      tableNumber: String(tableNumber).trim(),
      customerNickname: customerNickname.trim(),
      sessionId,
      tableSessionId,
    }
    localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession))
    setSession(nextSession)
    setSessionError('')
    return nextSession
  }, [])

  const clearSession = useCallback(async () => {
    const sessionToClear = session
    localStorage.removeItem(sessionStorageKey)
    setSession(null)
    setTableSession(null)
    setSessionError('')

    try {
      if (sessionToClear?.tableSessionId) await leaveTableSession(sessionToClear)
    } catch (error) {
      console.error('[Customer Session] Failed to leave table session:', error)
    }
  }, [session])

  useEffect(() => {
    if (!session?.tableSessionId) return () => {}

    return subscribeToTableSession(
      session.tableSessionId,
      (nextTableSession) => {
        if (!nextTableSession || nextTableSession.status !== 'active') {
          localStorage.removeItem(sessionStorageKey)
          setSession(null)
          setTableSession(null)
          return
        }

        setSessionError('')
        setTableSession(nextTableSession)
      },
      (error) => {
        console.error('[Customer Session] Failed to subscribe to table session:', error)
        setSessionError('We could not verify your table session right now. Please try again.')
      },
    )
  }, [session?.tableSessionId])

  return <CustomerSessionContext.Provider value={{ session, tableSession, sessionError, startSession, clearSession }}>{children}</CustomerSessionContext.Provider>
}

export default CustomerSessionProvider
