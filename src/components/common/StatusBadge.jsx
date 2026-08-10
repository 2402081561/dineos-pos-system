function StatusBadge({ status }) {
  const themes = {
    New: 'bg-blue-50 text-blue-700 ring-blue-100',
    Preparing: 'bg-amber-50 text-amber-700 ring-amber-100',
    Ready: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    Occupied: 'bg-orange-50 text-orange-700 ring-orange-100',
    Ordering: 'bg-violet-50 text-violet-700 ring-violet-100',
    'Awaiting bill': 'bg-rose-50 text-rose-700 ring-rose-100',
  }
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${themes[status] ?? 'bg-slate-50 text-slate-600 ring-slate-200'}`}>{status}</span>
}

export default StatusBadge
