import { useState } from 'react'
import { listRememberedStaffSessions, selectRememberedStaffSession } from '../../utils/rememberedStaffSession'
import { staffReturnPath } from '../../utils/staffReturnPath'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'

export default function RememberedStaffAccounts({ disabled = false }) {
  const { t } = useCustomerLanguage()
  const [saved, setSaved] = useState(() => {
    try { return listRememberedStaffSessions() } catch { return [] }
  })
  const [error, setError] = useState('')
  if (!saved.length) return null
  function resume(slot) {
    try {
      const selected = selectRememberedStaffSession(slot)
      if (!selected) { setSaved(listRememberedStaffSessions()); setError(t('This saved login is no longer available. Please sign in again.')); return }
      // Reload creates an SDK client for that exact key. Tokens never enter URLs.
      window.location.assign(staffReturnPath(selected.role))
    } catch { setError(t('Your browser could not restore this login. Please sign in again.')) }
  }
  return <section className="mt-6 space-y-3 rounded-xl border border-slate-200 p-3">
    <h2 className="text-sm font-bold text-slate-900">{t('Saved accounts')}</h2>
    <p className="text-xs leading-5 text-slate-500">{t('Saved on this browser. Expires after 7 days without use.')}</p>
    {saved.map(account => <button key={account.slot} disabled={disabled} onClick={() => resume(account.slot)} type="button" className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-left text-sm disabled:opacity-50"><span className="min-w-0 break-words font-semibold">{account.name}</span><span className="text-xs capitalize text-slate-500">{t({admin:'Admin',cashier:'Cashier',kitchen:'Kitchen',staff:'Staff'}[account.role])} →</span></button>)}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </section>
}
