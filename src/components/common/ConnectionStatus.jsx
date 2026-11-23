import { useEffect, useState } from 'react'
import { connectionSnapshot, subscribeConnection } from '../../utils/connectionStatus'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'

export default function ConnectionStatus({ warningsOnly = false, compact = false }) {
  const { t, formatDate, locale } = useCustomerLanguage()
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
  if (compact) {
    const time = status.lastUpdated ? new Intl.DateTimeFormat(locale || 'en-MY', { timeZone: 'Asia/Kuching', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(status.lastUpdated) : ''
    const shortLabel = status.state === 'current' ? time : t({ checking: 'Checking live data…', stale: 'Reconnecting', offline: 'Offline' }[status.state])
    const detail = `${t(labels[status.state])}${status.lastUpdated ? ` · ${t('Last updated')}: ${formatDate(status.lastUpdated)}` : ''}`
    return <details className="no-print relative max-w-[5.5rem] shrink-0 text-xs font-normal text-slate-500 sm:max-w-full">
      <summary aria-label={detail} title={detail} className="flex min-h-8 w-fit max-w-full cursor-pointer list-none items-center gap-1.5 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 lg:min-h-11 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${warning ? 'bg-amber-500' : status.state === 'current' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
        <span role="status" aria-live="polite" className={`truncate tabular-nums ${warning ? 'text-amber-800' : ''}`}>{shortLabel}</span>
      </summary>
      <div className="absolute left-0 top-full z-30 mt-1 w-60 max-w-[80vw] rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700 shadow-lg">{detail}{warning && <p className="mt-1">{t('Check current data before acting. Nothing is queued for offline submission.')}</p>}</div>
    </details>
  }
  return <div role="status" aria-live="polite" className={`no-print mb-3 rounded-lg border px-3 py-2 text-xs ${warning ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-100 bg-white text-slate-500'}`}>
    <span aria-hidden="true">{warning ? '● ' : '○ '}</span>{t(labels[status.state])}
    {!warningsOnly && status.lastUpdated && <span className="ml-2">{t('Last updated')}: {formatDate(status.lastUpdated)}</span>}
    {warning && <span className="mt-1 block">{t('Check current data before acting. Nothing is queued for offline submission.')}</span>}
  </div>
}
