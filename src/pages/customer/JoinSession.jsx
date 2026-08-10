import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../components/common/Button'
import useCustomerSession from '../../hooks/useCustomerSession'
import { joinTableSession } from '../../services/tableSessionService'
import { createSessionId } from '../../utils/session'
import { getActiveTableByNumber } from '../../services/tableService'

function JoinSession() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { clearSession, session, startSession } = useCustomerSession()
  const tableNumber = searchParams.get('table')?.trim() ?? ''
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [isJoining, setIsJoining] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const customerNickname = nickname.trim()
    if (!tableNumber) {
      setError('Please scan the QR code on your table to begin.')
      return
    }
    if (!/^[1-9]\d*$/.test(tableNumber)) {
      setError('This table number is invalid. Please scan a valid table QR code.')
      return
    }
    if (!customerNickname) {
      setError('Please enter your name.')
      return
    }
    if (customerNickname.length > 20) {
      setError('Your name must be 20 characters or fewer.')
      return
    }
    try {
      setIsJoining(true)
      if (session?.tableNumber === tableNumber && session.customerNickname === customerNickname) {
        navigate('/menu', { replace: true })
        return
      }
      if (session) await clearSession()

      const table = await getActiveTableByNumber(tableNumber)
      if (!table) {
        setError('This table is unavailable. Please scan an active table QR code.')
        return
      }
      const sessionId = createSessionId()
      const tableSession = await joinTableSession({ tableNumber, customerNickname, sessionId })
      startSession(tableNumber, customerNickname, tableSession.id, sessionId)
      navigate('/menu', { replace: true })
    } catch (firebaseError) {
      console.error('[Join Session] Failed to join table session:', firebaseError)
      setError('We could not join this table right now. Please try again.')
    } finally {
      setIsJoining(false)
    }
  }

  return <div className="mx-auto max-w-md pt-4 sm:pt-8"><div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_18px_45px_rgb(15,23,42,0.09)]"><div className="bg-gradient-to-br from-orange-50 via-white to-white p-6 text-center sm:p-8"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-600 text-3xl text-white shadow-lg shadow-orange-600/20">⌁</div><p className="eyebrow mt-6">Welcome to DineOS</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Ready to order?</h1><p className="mt-3 text-sm leading-6 text-slate-500">Tell us your name and we&apos;ll keep your order connected to this table.</p><div className="mt-7 rounded-3xl border border-orange-100 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700">Your table</p><p className="mt-2 text-5xl font-extrabold tracking-tight text-orange-600">{tableNumber || '—'}</p></div></div><form className="p-6 sm:p-8" onSubmit={handleSubmit}><label className="block text-sm font-bold text-slate-800" htmlFor="nickname">Enter your name</label><input aria-describedby={error ? 'nickname-error' : undefined} aria-invalid={Boolean(error)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-base" disabled={isJoining} id="nickname" maxLength="20" onChange={(event) => { setNickname(event.target.value); setError('') }} placeholder="e.g. Jason" value={nickname} />{error && <p className="mt-2 text-sm font-medium text-red-600" id="nickname-error">{error}</p>}<Button className="mt-6 w-full py-3.5" disabled={isJoining} type="submit">{isJoining ? 'Joining table...' : 'Continue'}</Button><p className="mt-4 text-center text-xs leading-5 text-slate-400">Your session stays active when you refresh this page.</p></form></div></div>
}

export default JoinSession
