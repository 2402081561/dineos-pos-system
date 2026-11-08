import { useEffect, useRef, useState } from 'react'
import Button from '../../components/common/Button'
import useAdminAuth from '../../hooks/useAdminAuth'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { authenticatedApiRequest } from '../../services/supabaseAuthService'
import { notificationStatus, enableOrderNotifications, disableOrderNotifications, testOrderNotification } from '../../utils/orderNotifications'

export default function Notifications() {
  const { authUser } = useAdminAuth()
  return <DeviceNotifications key={authUser?.id} actor={authUser?.id} />
}

function DeviceNotifications({ actor }) {
  const { t, language } = useCustomerLanguage()
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [received, setReceived] = useState(false)
  const active = useRef(null)
  const flight = useRef(false)
  useEffect(() => {
    const token = {}; active.current = token
    let cancelled = false
    notificationStatus(authenticatedApiRequest, actor).then((value) => { if (!cancelled) setStatus({ actor, value }) }).catch(() => { if (!cancelled) setError('Could not check notifications. Please retry.') })
    return () => { cancelled = true; active.current = null }
  }, [actor])
  async function run(action) {
    if (flight.current) return
    flight.current = true
    const token = active.current
    const request = (...args) => {
      if (active.current !== token) throw new Error('Reopen this panel after switching accounts.')
      return authenticatedApiRequest(...args)
    }
    setBusy(true); setError(''); setMessage(''); setReceived(false)
    try {
      // Calling action synchronously retains the permission prompt's tap gesture.
      const result = await action(request)
      const next = await notificationStatus(request, actor)
      if (active.current === token) { setStatus({ actor, value: next }); if (typeof result === 'string') setMessage(result) }
    } catch (failure) { if (active.current === token) setError(failure.message || 'Could not check notifications. Please retry.') }
    finally { flight.current = false; if (active.current === token) setBusy(false) }
  }
  const current = status?.actor === actor ? status.value : null
  const help = current?.support === 'install' ? 'iPhone: open DineOS in Safari, tap Share → Add to Home Screen, then open it from that icon.'
    : current?.support === 'https' ? 'Notifications need a secure HTTPS website. Localhost on your computer cannot test phone lock-screen delivery.'
      : current?.support === 'denied' ? 'Notifications are blocked. Allow DineOS notifications in your phone or browser settings, then refresh.'
        : current?.support === 'unsupported' ? 'This browser does not support order push. Try Chrome on Android, or the iPhone home-screen app.' : ''
  return <section className="mx-auto max-w-xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
    <header><h1 className="text-xl font-bold">{t('Order notifications')}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{t('Receive new take-away order alerts on this phone, even with the screen locked. Tap an alert to open its order.')}</p></header>
    {current && <p className={`rounded-xl p-3 text-sm font-semibold ${current.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-600'}`}>{t(current.active ? 'Enabled on this device' : 'Not enabled on this device')}</p>}
    {help && <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">{t(help)}</p>}
    {current && !current.config.enabled && <p className="text-sm leading-6 text-slate-500">{t(current.config.schemaReady ? 'Order notifications are not configured yet.' : 'Order notifications need database upgrade 036.')}</p>}
    {current?.otherAccount && <p role="alert" className="text-sm text-amber-800">{t('Disable notifications on this device before switching accounts.')}</p>}
    <div className="flex flex-wrap gap-3">
      {current?.active ? <><Button disabled={busy} onClick={() => void run(async (request) => { await testOrderNotification(request, actor); return 'Test sent. Check your phone notifications; sending does not confirm receipt.' })}>{t('Send test notification')}</Button><Button variant="outline" disabled={busy} onClick={() => void run((request) => disableOrderNotifications(request, actor))}>{t('Turn off on this device')}</Button></> : <Button disabled={busy || !current?.config.enabled || current?.support !== 'supported' || current?.otherAccount} onClick={() => void run((request) => enableOrderNotifications(request, { config: current.config, userId: actor, language }))}>{t('Enable on this device')}</Button>}
      <Button variant="outline" disabled={busy} onClick={() => void run(async () => {})}>{t('Refresh status')}</Button>
    </div>
    {message && <div role="status" className="space-y-3 rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-900"><p>{t(message)}</p><label className="flex items-center gap-2"><input type="checkbox" checked={received} onChange={(event) => setReceived(event.target.checked)}/>{t('I saw the test notification on this phone')}</label>{received && <p>{t('Now lock the phone and ask another device to submit a take-away order for a real test.')}</p>}</div>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t(error)}</p>}
    <p className="border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">{t('This device only. Signing out turns its alerts off. Internet and an online server are required; silent mode, Focus and battery settings can affect alerts. Always check the order queue too.')}</p>
    <p className="text-xs leading-5 text-slate-500">{t('Device subscriptions last 30 days. Re-enable here to renew them. Alerts contain no customer phone numbers or notes.')}</p>
  </section>
}
