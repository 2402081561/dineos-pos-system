import useShopSettings from '../../hooks/useShopSettings'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../components/common/Button'
import MemberEmailAuth from '../../components/member/MemberEmailAuth'
import useCustomerSession from '../../hooks/useCustomerSession'
import { getCustomerSession } from '../../services/customerApi'
import { joinTableSession } from '../../services/tableSessionService'
import { customerVisitStorage } from '../../utils/customerVisitStorage'
import useMemberEmailAvailability from '../../hooks/useMemberEmailAvailability'

function JoinSession() {
  const { t } = useCustomerLanguage()
  const { name: shopName } = useShopSettings()
  const membership = useMemberEmailAvailability()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { clearSession, session, sessionError, startSession } = useCustomerSession()
  const tableNumber = searchParams.get('table')?.trim() ?? ''
  const [mode, setMode] = useState('welcome')
  const [registeredMember, setRegisteredMember] = useState(null)
  const [error, setError] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const joining = useRef(false)
  const pendingVisit = useRef(null)

  async function sharedTableSession({ guestOnly = false } = {}) {
    if (!/^[1-9]\d*$/.test(tableNumber)) throw new Error('Please scan the QR code on your table to begin.')
    // Reuse this visit if the membership response was lost. Sending the email
    // itself must not create/clear a table visit or discard an existing cart.
    const candidate = pendingVisit.current ?? session
    if (String(candidate?.tableNumber) === tableNumber && (!guestOnly || candidate.isSharedTable)) {
      try { await getCustomerSession(candidate.sessionId); return candidate }
      catch (e) { if (e.status !== 401) throw e; pendingVisit.current = null; if (session) await clearSession() }
    } else if (session) await clearSession()
    const next = await joinTableSession({ tableNumber, customerNickname: 'Shared Table' })
    pendingVisit.current = next
    return next
  }
  function activateSession(nextSession) {
    return startSession(tableNumber, nextSession.customerNickname, nextSession.tableSessionId, nextSession.sessionId, nextSession.memberId, nextSession.isSharedTable)
  }
  async function continueAsGuest() {
    if (joining.current) return
    joining.current = true
    try {
      setIsJoining(true); setError('')
      activateSession(await sharedTableSession({ guestOnly: true }))
      navigate('/menu', { replace: true })
    } catch (e) { setError(e.message || 'We could not join this table right now. Please try again.') }
    finally { joining.current = false; setIsJoining(false) }
  }
  function completed(result) {
    activateSession(result.session)
    if (mode === 'register') { setRegisteredMember(result.member); setMode('success') }
    else navigate('/menu', { replace: true })
  }
  function changeMode(next) {
    if (['login', 'register'].includes(next) && !membership.enabled) { setError('Member email login is not available yet. You can still order as Guest.'); return }
    if (['login', 'register'].includes(next) && !/^[1-9]\d*$/.test(tableNumber)) { setError('Please scan the QR code on your table to begin.'); return }
    if (['login', 'register'].includes(next) && session && customerVisitStorage.readDraft(session).items.length > 0) {
      setError('Please finish or clear your current cart before changing membership.')
      return
    }
    setMode(next); setError('')
  }
  return <div className="mx-auto max-w-md pt-4 sm:pt-8"><div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_18px_45px_rgb(15,23,42,0.09)]">
    <div className="bg-gradient-to-br from-orange-50 via-white to-white p-6 text-center sm:p-8">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-600 text-3xl text-white">⌁</div>
      <p className="eyebrow mt-6">{t('Welcome to {{shopName}}', { shopName })}</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{mode === 'register' ? t('Join Membership') : mode === 'login' ? t('Member Login') : mode === 'success' ? t('Membership Created') : t('Ready to order?')}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">{mode === 'welcome' ? t('Order as a Guest, or use membership to earn points and redeem rewards.') : t('You are joining Table {{number}}.', { number: tableNumber || '—' })}</p>
      {mode === 'welcome' && <div className="mt-7 rounded-3xl border border-orange-100 bg-white p-5"><p className="text-xs font-bold text-orange-700">{t('Your table')}</p><p className="mt-2 text-5xl font-extrabold text-orange-600">{tableNumber || '—'}</p></div>}
    </div>
    <div className="p-6 sm:p-8">
      {(error || sessionError) && <p className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700" role="alert">{t(error || sessionError)}</p>}
      {mode === 'welcome' && <div className="space-y-3">
        <Button className="w-full py-3.5" disabled={isJoining} onClick={continueAsGuest}>{isJoining ? t('Opening your table...') : t('Continue as Guest')}</Button>
        <Button className="w-full py-3.5" disabled={isJoining || !membership.enabled} onClick={() => changeMode('login')} variant="outline">{t('Member Login')}</Button>
        <button className="min-h-11 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={isJoining || !membership.enabled} onClick={() => changeMode('register')} type="button">{t('Create Membership')}</button>
        {!membership.enabled && <p role="status" className="rounded-xl bg-slate-50 p-3 text-center text-xs leading-5 text-slate-600">{t(membership.isLoading ? 'Checking membership availability...' : 'Member email login is not available yet. You can still order as Guest.')}</p>}
        <p className="pt-2 text-center text-xs leading-5 text-slate-400">{t('Membership is optional. Guest ordering works without an account.')}</p>
      </div>}
      {['login', 'register'].includes(mode) && (membership.enabled ? <MemberEmailAuth key={`${mode}-${tableNumber}`} purpose={mode} getTableSession={sharedTableSession} onSuccess={completed} onBack={() => changeMode('welcome')} /> : <div><p role="status" className="rounded-xl bg-slate-50 p-3 text-sm">{t('Member email login is not available yet. You can still order as Guest.')}</p><Button className="mt-3 w-full" onClick={() => changeMode('welcome')} variant="outline">{t('← Back')}</Button></div>)}
      {mode === 'success' && registeredMember && <div className="text-center">
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5"><p className="text-3xl">✓</p><p className="mt-2 font-bold text-emerald-900">{t('Welcome, {{name}}', { name: registeredMember.name })}</p><p className="mt-4 text-xs font-bold text-emerald-700">{t('Your Member ID')}</p><p className="mt-1 text-2xl font-extrabold text-emerald-900">{registeredMember.memberId}</p><p className="mt-3 break-all text-sm text-emerald-800">{registeredMember.email}</p><p className="mt-3 text-xs leading-5 text-emerald-800">{t('Next time, sign in with your email and verification code.')}</p></div>
        <Button className="mt-6 w-full py-3.5" onClick={() => navigate('/menu', { replace: true })}>{t('Start Ordering')}</Button>
      </div>}
    </div>
  </div></div>
}
export default JoinSession
