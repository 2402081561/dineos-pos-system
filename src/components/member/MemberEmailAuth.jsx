import { useEffect, useRef, useState } from 'react'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import Button from '../common/Button'
import { sendMemberEmailCode, verifyMemberEmailCode, normalizeMemberEmail } from '../../services/memberOtpService'
import { createCustomerMember, loginCustomerMember } from '../../services/customerApi'
import { isValidMemberPhone } from '../../utils/member'

export default function MemberEmailAuth({ purpose, getTableSession, onSuccess, onBack }) {
  const { t } = useCustomerLanguage()
  const [form, setForm] = useState({ name: '', phone: '', email: '', emailNotificationsEnabled: false })
  const [requestedEmail, setRequestedEmail] = useState('')
  const [code, setCode] = useState('')
  const [deadline, setDeadline] = useState(0)
  const [clock, setClock] = useState(Date.now)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false), verifiedToken = useRef(''), mounted = useRef(true)
  const registration = purpose === 'register'
  const seconds = Math.max(0, Math.ceil((deadline - clock) / 1000))
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; verifiedToken.current = '' } }, [])
  useEffect(() => {
    if (!deadline) return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [deadline])
  function update(key, value) { setForm((current) => ({ ...current, [key]: value })) }
  async function sendCode(event) {
    event?.preventDefault()
    if (busy.current || (requestedEmail && Date.now() < deadline)) return
    busy.current = true; setIsBusy(true); setError('')
    try {
      const email = normalizeMemberEmail(form.email)
      if (registration && (!form.name.trim() || form.name.trim().length > 80)) throw new Error('Enter a name between 1 and 80 characters.')
      if (registration && !isValidMemberPhone(form.phone)) throw new Error('Enter a valid Malaysian phone number, or an international number with a + country code.')
      await sendMemberEmailCode(email, purpose)
      if (!mounted.current) return
      verifiedToken.current = ''
      setCode(''); setRequestedEmail(email); setClock(Date.now()); setDeadline(Date.now() + 60000)
    } catch (e) { if (mounted.current) setError(e.message || 'Could not send the email code. Please try again or continue as Guest.') }
    finally { busy.current = false; if (mounted.current) setIsBusy(false) }
  }
  async function verifyCode(event) {
    event.preventDefault()
    if (busy.current || !requestedEmail) return
    busy.current = true; setIsBusy(true); setError('')
    try {
      // Retry a verified token in memory if the restaurant API fails after the
      // one-use OTP was consumed. Never verify a consumed code again on retry.
      verifiedToken.current ||= await verifyMemberEmailCode(requestedEmail, code)
      if (!mounted.current) return
      const session = await getTableSession()
      if (!mounted.current) return
      const result = registration
        ? await createCustomerMember(session.sessionId, { ...form, email: requestedEmail }, verifiedToken.current)
        : await loginCustomerMember(session.sessionId, verifiedToken.current)
      if (!mounted.current) return
      if (!result?.session?.sessionId || !result?.member?.id) throw new Error('Could not confirm your membership. Please try again.')
      verifiedToken.current = ''
      onSuccess(result)
    } catch (e) {
      if (e.status === 401) verifiedToken.current = ''
      if (mounted.current) setError(e.message || 'Could not confirm your membership. Please try again.')
    } finally { busy.current = false; if (mounted.current) setIsBusy(false) }
  }
  const inputClass = 'mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal outline-none focus:border-orange-400 disabled:bg-slate-50'
  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{t(error)}</p>}
    {!requestedEmail ? <form className="space-y-5" onSubmit={sendCode}>
      {registration && <>
        <label className="block text-sm font-bold" htmlFor="member-name">{t('Name')}<input id="member-name" autoComplete="name" className={inputClass} disabled={isBusy} maxLength={80} required value={form.name} onChange={(e) => update('name', e.target.value)} /></label>
        <label className="block text-sm font-bold" htmlFor="member-phone">{t('Phone number')}<input id="member-phone" autoComplete="tel" className={inputClass} disabled={isBusy} maxLength={25} placeholder="01XXXXXXXX" required type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} /><span className="mt-1 block text-xs font-normal text-slate-500">{t('Your phone is contact information. Login is verified by email.')}</span></label>
      </>}
      <label className="block text-sm font-bold" htmlFor="member-email">{t('Email')}<input id="member-email" autoComplete="email" autoCapitalize="none" spellCheck={false} className={inputClass} disabled={isBusy} maxLength={254} placeholder="your@gmail.com" required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></label>
      {registration && <label className="flex items-start gap-3 text-sm text-slate-600"><input checked={form.emailNotificationsEnabled} disabled={isBusy} className="mt-1 h-4 w-4 accent-orange-600" type="checkbox" onChange={(e) => update('emailNotificationsEnabled', e.target.checked)} /><span>{t('Receive email notifications when available.')}</span></label>}
      <p className="text-sm leading-6 text-slate-500">{t('We will email you a 6-digit code. No password is needed.')}</p>
      <Button className="w-full" disabled={isBusy} type="submit">{isBusy ? t('Sending code...') : t('Send email code')}</Button>
    </form> : <form className="space-y-5" onSubmit={verifyCode}>
      <div className="rounded-xl border border-orange-100 bg-orange-50 p-4"><p className="text-sm font-semibold">{t('Check your email')}</p><p className="mt-1 break-all text-sm">{requestedEmail}</p><p className="mt-2 text-xs leading-5 text-slate-600">{t('Check Spam or Junk if the code is not in your inbox.')}</p></div>
      <label className="block text-sm font-bold" htmlFor="member-otp">{t('Verification code')}<input id="member-otp" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} className={`${inputClass} text-center text-2xl font-bold tracking-[0.3em]`} disabled={isBusy} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /></label>
      <Button className="w-full" disabled={isBusy || code.length !== 6} type="submit">{isBusy ? t('Verifying...') : t('Verify and continue')}</Button>
      <button type="button" className="min-h-11 w-full rounded-lg px-3 py-2 text-sm font-semibold text-orange-700 disabled:text-slate-400" disabled={isBusy || seconds > 0} onClick={() => void sendCode()}>{seconds > 0 ? t('Resend code in {{seconds}}s', { seconds }) : t('Resend code')}</button>
      <button type="button" className="min-h-11 w-full rounded-lg px-3 py-2 text-sm text-slate-600" disabled={isBusy} onClick={() => { verifiedToken.current = ''; setRequestedEmail(''); setCode(''); setError('') }}>{t('Change email or details')}</button>
    </form>}
    <button className="min-h-11 w-full rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50" disabled={isBusy} onClick={onBack} type="button">{t('← Back')}</button>
  </div>
}
