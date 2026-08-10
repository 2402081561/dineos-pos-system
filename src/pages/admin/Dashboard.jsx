import AdminDashboardSkeleton from '../../components/admin/AdminDashboardSkeleton'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useAdminDashboard from '../../hooks/useAdminDashboard'
import { formatCurrency } from '../../utils/currency'

function formatStatus(status) {
  return `${status?.charAt(0).toUpperCase() ?? ''}${status?.slice(1) ?? ''}`
}

const metricIcons = ['▣', '↗', '◷', '♧']

function Dashboard() {
  const { dashboardData, isLoading, error } = useAdminDashboard()
  if (isLoading) return <AdminDashboardSkeleton />
  if (error) return <StatePanel description={error} title="Dashboard unavailable" tone="error" />
  const metrics = [[dashboardData.todayOrderCount, 'Today’s orders', 'Orders created today'], [formatCurrency(dashboardData.todayRevenue), 'Today’s revenue', 'Served orders today'], [dashboardData.activeOrderCount, 'Active orders', 'Received, preparing and ready'], [dashboardData.pendingRequestCount, 'Pending requests', 'Customer service requests']]

  return <div className="space-y-8"><SectionHeading description="Live operational data for today’s restaurant activity." eyebrow="Restaurant overview" title="Admin dashboard" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([value, label, note], index) => <article className="surface-card relative overflow-hidden p-5 sm:p-6" key={label}><span className="absolute -right-3 -top-3 flex h-16 w-16 items-end justify-start rounded-full bg-orange-50 pl-3 pb-2 text-lg text-orange-600">{metricIcons[index]}</span><p className="relative text-3xl font-extrabold tracking-tight text-slate-900">{value}</p><p className="relative mt-3 text-sm font-bold text-slate-600">{label}</p><p className="relative mt-2 text-xs font-medium text-orange-600">{note}</p></article>)}</div><div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]"><section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_12px_32px_rgb(15,23,42,0.06)]"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="text-lg font-bold">Popular foods</h2><p className="mt-1 text-sm text-slate-500">Top ordered dishes today</p></div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">Top 5</span></div>{dashboardData.popularFoods.length === 0 ? <p className="p-6 text-sm text-slate-500">No food sales data for today.</p> : <div className="divide-y divide-slate-100">{dashboardData.popularFoods.map((food, index) => <div className="flex items-center gap-4 p-4 transition hover:bg-slate-50" key={food.name}><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-sm font-bold text-orange-600">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{food.name}</p><p className="mt-1 text-xs text-slate-400">{food.quantity} ordered today</p></div><span className="text-base font-extrabold text-slate-700">{food.quantity}</span></div>)}</div>}</section><section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_12px_32px_rgb(15,23,42,0.06)]"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="text-lg font-bold">Recent orders</h2><p className="mt-1 text-sm text-slate-500">Latest table activity</p></div></div>{dashboardData.recentOrders.length === 0 ? <p className="p-6 text-sm text-slate-500">No recent orders.</p> : <div className="divide-y divide-slate-100">{dashboardData.recentOrders.map((order) => { const orderNumber = order.orderNumber ?? `#${order.id.slice(-6).toUpperCase()}`; const tableNumber = order.tableNumber ?? order.tableId?.replace('temporary-table-', '') ?? '—'; return <div className="flex items-center justify-between gap-3 p-4 transition hover:bg-slate-50" key={order.id}><div><p className="text-sm font-bold text-slate-800">{orderNumber} <span className="font-medium text-slate-400">· Table {tableNumber}</span></p><p className="mt-1 text-xs font-semibold text-orange-600">{formatCurrency(order.grandTotal)}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{formatStatus(order.status)}</span></div> })}</div>}</section></div></div>
}

export default Dashboard
