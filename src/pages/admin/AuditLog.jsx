import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useEffect, useMemo, useState } from 'react'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import { subscribeToSupabaseAuditLogs } from '../../services/adminApiService'

function timestampText(timestamp) {
  const date = timestamp?.toDate?.() ?? new Date(timestamp)
  return date instanceof Date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—'
}

function AuditLog() {
  const { t: uiText } = useCustomerLanguage()

  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('all')
  const [category, setCategory] = useState('all')
  const [date, setDate] = useState('')
  useEffect(() => subscribeToSupabaseAuditLogs((nextLogs) => { setLogs(nextLogs.map((log) => ({ ...log, category: log.category ?? 'ADMIN' }))); setError(''); setIsLoading(false) }, (apiError) => { console.error('[Audit Log] Failed to load logs:', apiError); setError('We could not load audit logs right now. Please try again shortly.'); setIsLoading(false) }), [])
  const actions = useMemo(() => [...new Set(logs.map((log) => log.action).filter(Boolean))].sort(), [logs])
  const categories = useMemo(() => [...new Set(logs.map((log) => log.category).filter(Boolean))].sort(), [logs])
  const filteredLogs = useMemo(() => logs.filter((log) => {
    const matchesAction = action === 'all' || log.action === action
    const matchesCategory = category === 'all' || log.category === category
    const logDate = log.createdAt?.toDate?.() ?? new Date(log.createdAt)
    const dateValue = logDate ? `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}` : ''
    const searchable = `${log.actorId ?? ''} ${log.targetId ?? ''} ${log.orderId ?? ''} ${log.receiptNumber ?? ''} ${log.tableNumber ?? ''}`.toLowerCase()
    return matchesAction && matchesCategory && (!date || dateValue === date) && searchable.includes(search.trim().toLowerCase())
  }), [action, category, date, logs, search])
  if (isLoading) return <div className="space-y-6 animate-pulse"><div className="h-20 rounded-2xl bg-slate-200" /><div className="h-96 rounded-2xl bg-white" /></div>
  if (error) return <StatePanel description={uiText(error)} title={uiText("Audit log unavailable")} tone="error" />
  return <div className="space-y-6"><SectionHeading description={uiText("Recent operational events. This view keeps the latest 100 records for predictable realtime updates.")} eyebrow={uiText("Administration")} title={uiText("Audit log")} /><section className="surface-card overflow-hidden"><div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-4"><input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder={uiText("Search actor, order, receipt or table")} value={search} /><select className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" onChange={(event) => setAction(event.target.value)} value={action}><option value="all">{uiText("All actions")}</option>{actions.map((value) => <option key={value} value={value}>{value}</option>)}</select><select className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" onChange={(event) => setCategory(event.target.value)} value={category}><option value="all">{uiText("All categories")}</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select><input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" onChange={(event) => setDate(event.target.value)} type="date" value={date} /></div>{filteredLogs.length === 0 ? <div className="p-8"><StatePanel description={uiText("Meaningful operational events will appear here.")} title={uiText("No audit events found")} /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">{uiText("Date/time")}</th><th className="px-5 py-3">{uiText("Action")}</th><th className="px-5 py-3">{uiText("Category")}</th><th className="px-5 py-3">{uiText("Actor")}</th><th className="px-5 py-3">{uiText("Target")}</th><th className="px-5 py-3">{uiText("Table / order / receipt")}</th><th className="px-5 py-3">{uiText("Details")}</th></tr></thead><tbody>{filteredLogs.map((log) => <tr className="border-b last:border-0" key={log.id}><td className="px-5 py-4 text-slate-600">{timestampText(log.createdAt)}</td><td className="px-5 py-4 font-semibold text-slate-800">{log.action || '—'}</td><td className="px-5 py-4 text-slate-600">{log.category || '—'}</td><td className="px-5 py-4 text-slate-600">{uiText(log.actorName || log.actorId || 'System / unknown')}</td><td className="px-5 py-4 text-slate-600">{log.targetType ? `${log.targetType} · ${log.targetId ?? '—'}` : '—'}</td><td className="px-5 py-4 text-slate-600">{[log.tableNumber && `Table ${log.tableNumber}`, log.orderId, log.receiptNumber].filter(Boolean).join(' · ') || '—'}</td><td className="px-5 py-4 text-xs text-slate-500">{Object.entries(log.details ?? {}).map(([key, value]) => `${key}: ${value}`).join(' · ') || '—'}</td></tr>)}</tbody></table></div>}</section></div>
}

export default AuditLog
