import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAdminAuth from '../hooks/useAdminAuth'
import useCustomerLanguage from '../hooks/useCustomerLanguage'
import SectionHeading from '../components/common/SectionHeading'
import Button from '../components/common/Button'

export default function AccountSettings() {
  const { t } = useCustomerLanguage()
  const { authUser, signOut } = useAdminAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [isSigningOut, setSigningOut] = useState(false)
  async function handleSignOut() {
    if (isSigningOut) return
    setSigningOut(true); setError('')
    try { await signOut(); navigate('/admin/login', { replace: true }) }
    catch (failure) { setError(failure.message || 'Could not disable this device. Check your network and try again.') }
    finally { setSigningOut(false) }
  }
  return <div className="mx-auto max-w-2xl space-y-5">
    <SectionHeading title={t('Account settings')} />
    <section className="surface-card space-y-4 p-5">
      <h2 className="break-words text-lg font-bold text-slate-900">{authUser?.displayName || authUser?.email}</h2>
      {authUser?.email && authUser.email !== authUser.displayName && <p className="break-words text-sm text-slate-500">{authUser.email}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t(error)}</p>}
      <Button disabled={isSigningOut} aria-busy={isSigningOut || undefined} onClick={handleSignOut} variant="danger">{t('Log out')}</Button>
      <Button className="ml-3" disabled={isSigningOut} onClick={() => navigate('/admin/login', { state: { switchAccount: true } })} variant="outline">{t('Use another account')}</Button>
    </section>
  </div>
}
