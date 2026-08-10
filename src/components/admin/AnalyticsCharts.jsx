import { formatCurrency } from '../../utils/currency'

const chartColors = ['#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa', '#cbd5e1']

export function BarChart({ data, formatValue = (value) => value, title }) {
  const maximum = Math.max(...data.map((item) => item.value), 1)
  return <div aria-label={title} className="flex h-60 items-end gap-2 border-b border-slate-100 pt-6">{data.map((item) => <div className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" key={item.label}><div className="relative w-full max-w-10 rounded-t-lg bg-orange-200 transition-all duration-200 group-hover:bg-orange-600" style={{ height: `${Math.max((item.value / maximum) * 100, item.value ? 4 : 0)}%` }}><span className="absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white shadow-lg group-hover:block">{formatValue(item.value)}</span></div><span className="w-full truncate text-center text-[10px] font-medium text-slate-400 sm:text-xs">{item.label}</span></div>)}</div>
}

export function DonutChart({ data, title }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  let cursor = 0
  const gradient = total ? data.filter((item) => item.value > 0).map((item, index) => {
    const start = cursor
    cursor += (item.value / total) * 100
    return `${chartColors[index % chartColors.length]} ${start}% ${cursor}%`
  }).join(', ') : '#e2e8f0 0 100%'

  return <div className="grid items-center gap-6 sm:grid-cols-[150px_1fr]"><div aria-label={title} className="relative mx-auto h-36 w-36 rounded-full" style={{ background: `conic-gradient(${gradient})` }}><div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white"><span className="text-2xl font-extrabold text-slate-900">{total}</span><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Orders</span></div></div><div className="grid gap-2">{data.map((item, index) => <div className="flex items-center justify-between gap-3 text-sm" key={item.label}><span className="flex min-w-0 items-center gap-2 capitalize text-slate-600"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />{item.label}</span><span className="font-bold text-slate-800">{item.value}</span></div>)}</div></div>
}

export function RevenueList({ data }) {
  const total = data.reduce((sum, item) => sum + item.revenue, 0)
  return <div className="space-y-4">{data.map((item) => <div key={item.name}><div className="flex justify-between gap-4 text-sm"><span className="font-semibold text-slate-700">{item.name}</span><span className="font-bold text-slate-900">{formatCurrency(item.revenue)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-orange-500" style={{ width: `${total ? (item.revenue / total) * 100 : 0}%` }} /></div></div>)}</div>
}
