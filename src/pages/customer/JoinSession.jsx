import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../components/common/Button'
import useCustomerSession from '../../hooks/useCustomerSession'
import { createCustomerMember, getCustomerSession, loginCustomerMember } from '../../services/customerApi'
import { joinTableSession } from '../../services/tableSessionService'

const emptyRegistration = { name: '', phone: '', email: '', emailNotificationsEnabled: true }
const emptyLogin = { memberId: '', phone: '' }

function JoinSession() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { clearSession, session, startSession } = useCustomerSession()
  const tableNumber = searchParams.get('table')?.trim() ?? ''
  const [mode, setMode] = useState('welcome')
  const [registration, setRegistration] = useState(emptyRegistration)
  const [login, setLogin] = useState(emptyLogin)
  const [registeredMember, setRegisteredMember] = useState(null)
  const [error, setError] = useState('')
  const [isJoining, setIsJoining] = useState(false)

  function validateTableNumber() {
    if (!tableNumber) throw new Error('Please scan the QR code on your table to begin.')
    if (!/^[1-9]\d*$/.test(tableNumber)) throw new Error('This table number is invalid. Please scan a valid table QR code.')
  }

  async function sharedTableSession() {
    validateTableNumber()
    if (session?.tableNumber === tableNumber && session.isSharedTable) {
      try {
        await getCustomerSession(session.sessionId)
        return session
      } catch { await clearSession() }
    } else if (session) await clearSession()
    return joinTableSession({ tableNumber, customerNickname: 'Shared Table' })
  }

  function activateSession(nextSession) {
    return startSession(
      tableNumber,
      nextSession.customerNickname,
      nextSession.tableSessionId,
      nextSession.sessionId,
      nextSession.memberId,
      nextSession.isSharedTable,
    )
  }

  async function continueAsGuest() {
    try {
      setIsJoining(true)
      setError('')
      const nextSession = await sharedTableSession()
      activateSession(nextSession)
      navigate('/menu', { replace: true })
    } catch (joinError) {
      console.error('[Join Session] Failed to join as Guest:', joinError)
      setError(joinError instanceof Error ? joinError.message : 'We could not join this table right now. Please try again.')
    } finally { setIsJoining(false) }
  }

  async function handleMemberLogin(event) {
    event.preventDefault()
    try {
      setIsJoining(true)
      setError('')
      const shared = await sharedTableSession()
      const result = await loginCustomerMember(shared.sessionId, login)
      activateSession(result.session)
      navigate('/menu', { replace: true })
    } catch (loginError) {
      console.error('[Join Session] Member login failed:', loginError)
      setError(loginError instanceof Error ? loginError.message : 'We could not sign in to this membership.')
    } finally { setIsJoining(false) }
  }

  async function handleMemberRegistration(event) {
    event.preventDefault()
    try {
      setIsJoining(true)
      setError('')
      const shared = await sharedTableSession()
      const result = await createCustomerMember(shared.sessionId, registration)
      activateSession(result.session)
      setRegisteredMember(result.member)
      setMode('success')
    } catch (registrationError) {
      console.error('[Join Session] Member registration failed:', registrationError)
      const message = registrationError instanceof Error ? registrationError.message : 'We could not create this membership.'
      setError(message)
      if (message.includes('already exists')) {
        setLogin((current) => ({ ...current, phone: registration.phone }))
        setMode('login')
      }
    } finally { setIsJoining(false) }
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    setError('')
  }

  return <div className="mx-auto max-w-md pt-4 sm:pt-8"><div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_18px_45px_rgb(15,23,42,0.09)]"><div className="bg-gradient-to-br from-orange-50 via-white to-white p-6 text-center sm:p-8"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-600 text-3xl text-white shadow-lg shadow-orange-600/20">⌁</div><p className="eyebrow mt-6">Welcome to DineOS</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{mode === 'register' ? 'Join Membership' : mode === 'login' ? 'Member Login' : mode === 'success' ? 'Membership Created' : 'Ready to order?'}</h1><p className="mt-3 text-sm leading-6 text-slate-500">{mode === 'welcome' ? 'Order as a Guest, or use membership to earn points and redeem rewards.' : `You are joining Table ${tableNumber || '—'}.`}</p>{mode === 'welcome' && <div className="mt-7 rounded-3xl border border-orange-100 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700">Your table</p><p className="mt-2 text-5xl font-extrabold tracking-tight text-orange-600">{tableNumber || '—'}</p></div>}</div><div className="p-6 sm:p-8">{error && <p className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700" role="alert">{error}</p>}{mode === 'welcome' && <div className="space-y-3"><Button className="w-full py-3.5" disabled={isJoining} onClick={continueAsGuest}>{isJoining ? 'Opening your table...' : 'Continue as Guest'}</Button><Button className="w-full py-3.5" disabled={isJoining} onClick={() => changeMode('login')} variant="outline">Member Login</Button><button className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-orange-700 transition hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-200" onClick={() => changeMode('register')} type="button">Create Membership</button><p className="pt-2 text-center text-xs leading-5 text-slate-400">Membership is optional. Guest ordering works without an account.</p></div>}{mode === 'login' && <form onSubmit={handleMemberLogin}><label className="block text-sm font-bold text-slate-800" htmlFor="member-id">Member ID<input autoCapitalize="characters" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal uppercase outline-none focus:border-orange-400" id="member-id" maxLength="20" onChange={(event) => setLogin((current) => ({ ...current, memberId: event.target.value }))} placeholder="MEM-00001" required value={login.memberId} /></label><label className="mt-5 block text-sm font-bold text-slate-800" htmlFor="member-phone">Phone number<input autoComplete="tel" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-orange-400" id="member-phone" onChange={(event) => setLogin((current) => ({ ...current, phone: event.target.value }))} placeholder="01XXXXXXXX" required type="tel" value={login.phone} /></label><Button className="mt-6 w-full py-3.5" disabled={isJoining} type="submit">{isJoining ? 'Signing in...' : 'Login and Start Ordering'}</Button><button className="mt-3 w-full rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50" onClick={() => changeMode('welcome')} type="button">← Back</button></form>}{mode === 'register' && <form onSubmit={handleMemberRegistration}><label className="block text-sm font-bold text-slate-800" htmlFor="member-name">Name<input autoComplete="name" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-orange-400" id="member-name" maxLength="80" onChange={(event) => setRegistration((current) => ({ ...current, name: event.target.value }))} placeholder="Your name" required value={registration.name} /></label><label className="mt-5 block text-sm font-bold text-slate-800" htmlFor="registration-phone">Phone<input autoComplete="tel" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-orange-400" id="registration-phone" onChange={(event) => setRegistration((current) => ({ ...current, phone: event.target.value }))} placeholder="01XXXXXXXX" required type="tel" value={registration.phone} /></label><label className="mt-5 block text-sm font-bold text-slate-800" htmlFor="member-email">Email <span className="font-normal text-slate-400">(optional)</span><input autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-orange-400" id="member-email" onChange={(event) => setRegistration((current) => ({ ...current, email: event.target.value }))} placeholder="your@email.com" type="email" value={registration.email} /></label><label className="mt-5 flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600"><input checked={registration.emailNotificationsEnabled} className="mt-0.5 h-4 w-4 accent-orange-600" onChange={(event) => setRegistration((current) => ({ ...current, emailNotificationsEnabled: event.target.checked }))} type="checkbox" /><span>Receive email notifications when available.</span></label><Button className="mt-6 w-full py-3.5" disabled={isJoining} type="submit">{isJoining ? 'Creating membership...' : 'Join Membership'}</Button><button className="mt-3 w-full rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50" onClick={() => changeMode('welcome')} type="button">← Back</button></form>}{mode === 'success' && registeredMember && <div className="text-center"><div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5"><p className="text-3xl">✓</p><p className="mt-2 font-bold text-emerald-900">Welcome, {registeredMember.name}</p><p className="mt-4 text-xs font-bold uppercase tracking-wide text-emerald-700">Your Member ID</p><p className="mt-1 text-2xl font-extrabold tracking-wider text-emerald-900">{registeredMember.memberId}</p><p className="mt-3 text-xs leading-5 text-emerald-800">Save this ID. Use it with your phone number on your next visit.</p></div><Button className="mt-6 w-full py-3.5" onClick={() => navigate('/menu', { replace: true })}>Start Ordering</Button></div>}</div></div></div>
}

export default JoinSession
