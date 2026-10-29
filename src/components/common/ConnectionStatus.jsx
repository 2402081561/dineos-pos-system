import { useEffect, useState } from 'react'
import { connectionSnapshot, subscribeConnection } from '../../utils/connectionStatus'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'

export default function ConnectionStatus({ warningsOnly = false }) {
  const { t, formatDate } = useCustomerLanguage()
  const [status, setStatus] = useState(() => connectionSnapshot(Date.now(), navigator.onLine))
  useEffect(() => {
    const update = () => setStatus(connectionSnapshot(Date.now(), navigator.onLine))
    const unsubscribe = subscribeConnection(update)
    const timer = setInterval(update, 1000)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    update()
    return () => { unsubscribe(); clearInterval(timer); window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  if (status.state === 'idle') return null
  const warning = ['offline', 'stale'].includes(status.state)
  if (warningsOnly && !warning) return null
  const labels = { current: 'Live data updated', checking: 'Checking live data…', stale: 'Reconnecting — displayed data may be out of date.', offline: 'You are offline. Orders and payments cannot be sent until you reconnect.' }
  return <div role="status" aria-live="polite" className={`no-print mb-3 rounded-lg border px-3 py-2 text-xs ${warning ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-100 bg-white text-slate-500'}`}>
    <span aria-hidden="true">{warning ? '● ' : '○ '}</span>{t(labels[status.state])}
    {!warningsOnly && status.lastUpdated && <span className="ml-2">{t('Last updated')}: {formatDate(status.lastUpdated)}</span>}
    {warning && <span className="mt-1 block">{t('Check current data before acting. Nothing is queued for offline submission.')}</span>}
  </div>
}
