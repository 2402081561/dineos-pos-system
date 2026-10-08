import { Link } from 'react-router-dom'
import { formatCurrency } from '../../utils/currency'
import { orderNumber, orderStatusLabel, orderStatusStyle, orderTable, orderTypeLabel } from '../../utils/adminOrderPresentation'

export default function AdminDashboardOverview({ data }) {
  const metrics = [
    ['Today’s revenue', formatCurrency(data.todayRevenue), 'Payments recorded today'],
    ['Today’s orders', data.todayOrderCount, 'Orders created today'],
    ['Active orders', data.activeOrderCount, 'Received · preparing · ready'],
    ['Pending requests', data.pendingRequestCount, 'Customer service requests'],
  ]
  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1><p className="mt-1 text-xs text-slate-500">Today · Malaysia time · Auto updates</p></div>
      <Link to="/cashier" className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">Open cashier</Link>
    </header>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map(([label, value, note], index) => <section key={label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"><h2 className="text-xs font-semibold text-slate-500">{label}</h2><p className={`mt-2 break-words text-2xl font-bold tabular-nums ${index === 0 ? 'text-orange-600' : 'text-slate-900'}`}>{value}</p><p className="mt-1 text-xs leading-5 text-slate-400">{note}</p></section>)}</div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]">
      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-bold">Recent orders</h2><Link to="/admin/orders" className="text-xs font-semibold text-orange-700 hover:underline">View all →</Link></header>
        {data.recentOrders.length === 0 ? <p className="p-6 text-sm text-slate-500">No recent orders.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-2 font-medium">Order / Table</th><th className="px-3 py-2 font-medium">Status</th><th className="px-4 py-2 text-right font-medium">Amount</th></tr></thead><tbody className="divide-y divide-slate-100">{data.recentOrders.map((order) => <tr key={order.id} className="hover:bg-slate-50/70"><td className="px-4 py-3"><p className="font-semibold text-slate-800">{orderNumber(order)}</p><p className="mt-1 text-xs text-slate-500">Table {orderTable(order)} · {orderTypeLabel(order.orderType)}</p></td><td className="px-3 py-3"><span className={`inline-block whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold ${orderStatusStyle(order.status)}`}>{orderStatusLabel(order.status)}</span></td><td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(order.grandTotal)}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-bold">Popular dishes</h2><span className="text-xs text-slate-400">Today · Top 5</span></header>
        {data.popularFoods.length === 0 ? <p className="p-6 text-sm text-slate-500">No food sales data for today.</p> : <ol className="divide-y divide-slate-100">{data.popularFoods.map((food, index) => <li key={food.name} className="flex items-center gap-3 px-4 py-3"><span className="w-4 shrink-0 text-xs text-slate-400">{index + 1}</span><p className="min-w-0 flex-1 break-words text-sm text-slate-700">{food.name}</p><span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{food.quantity}<span className="ml-1 text-xs font-normal text-slate-400">ordered</span></span></li>)}</ol>}
        <footer className="border-t border-slate-100 px-4 py-3"><Link to="/admin/reports" className="text-xs font-semibold text-orange-700 hover:underline">View reports →</Link></footer>
      </section>
    </div>
  </div>
}
