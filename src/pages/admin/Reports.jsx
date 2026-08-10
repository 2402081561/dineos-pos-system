import { useMemo, useState } from 'react'
import { BarChart, DonutChart, RevenueList } from '../../components/admin/AnalyticsCharts'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useReportsAnalytics from '../../hooks/useReportsAnalytics'
import { formatCurrency } from '../../utils/currency'
import { downloadCsv, formatDateTime, getOrderNumber } from '../../utils/reporting'

const filterOptions = [
  ['today', 'Today'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['year', 'This year'],
  ['custom', 'Custom range'],
]

const requestLabels = [
  ['water', 'Water', '💧'],
  ['requestBill', 'Bill requests', '▤'],
  ['callWaiter', 'Call waiter', '♧'],
  ['extraSpoon', 'Extra spoon', '🥄'],
]

function formatStatus(status) {
  return String(status ?? 'received').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function MetricCard({ label, note, value }) {
  return <article className="surface-card relative overflow-hidden p-5 sm:p-6"><span aria-hidden="true" className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-orange-50" /><p className="relative text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{value}</p><p className="relative mt-3 text-sm font-bold text-slate-700">{label}</p>{note && <p className="relative mt-1 text-xs font-medium text-slate-400">{note}</p>}</article>
}

function ReportsSkeleton() {
  return <div className="space-y-7 animate-pulse"><div className="h-24 rounded-3xl bg-slate-200" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div className="h-36 rounded-3xl bg-white" key={index} />)}</div><div className="h-96 rounded-3xl bg-white" /></div>
}

function Reports() {
  const [dateFilter, setDateFilter] = useState('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const { analytics, error, isLoading, range } = useReportsAnalytics({ customEnd, customStart, dateFilter })

  const metrics = useMemo(() => [
    [formatCurrency(analytics.summary.totalRevenue), 'Today’s revenue', 'Served orders in selected period'],
    [analytics.summary.totalOrders, 'Today’s orders', 'Orders created in selected period'],
    [formatCurrency(analytics.summary.averageOrderValue), 'Average order value', 'Across served orders'],
    [analytics.summary.activeTables, 'Active tables', `${analytics.summary.activeTableRecords} enabled in setup`],
    [analytics.summary.completedOrders, 'Completed orders', 'Served orders'],
    [analytics.summary.cancelledOrders, 'Cancelled orders', 'Cancelled in selected period'],
    [analytics.summary.pendingRequests, 'Pending service requests', 'Live customer queue'],
  ], [analytics.summary])

  function exportReport() {
    const rows = [
      ['DineOS report', range.label],
      ['Generated', new Date().toLocaleString('en-MY')],
      [],
      ['Metric', 'Value'],
      ['Revenue', formatCurrency(analytics.summary.totalRevenue)],
      ['Orders', analytics.summary.totalOrders],
      ['Average order value', formatCurrency(analytics.summary.averageOrderValue)],
      ['Completed orders', analytics.summary.completedOrders],
      ['Cancelled orders', analytics.summary.cancelledOrders],
      [],
      ['Order number', 'Table', 'Customer', 'Status', 'Total', 'Created time'],
      ...analytics.filteredOrders.map((order) => [getOrderNumber(order), order.tableNumber ?? order.tableId ?? '—', order.customerNickname ?? 'Guest', formatStatus(order.status), formatCurrency(order.grandTotal), formatDateTime(order.createdAt)]),
    ]
    downloadCsv(`dineos-report-${dateFilter}.csv`, rows)
  }

  if (isLoading) return <ReportsSkeleton />
  if (error) return <StatePanel description={error} title="Reports unavailable" tone="error" />

  return (
    <div className="space-y-7">
      <SectionHeading
        action={<Button className="w-full sm:w-auto" onClick={exportReport} variant="secondary">↓ Export CSV</Button>}
        description="Live operational performance and historical sales trends, calculated from your existing restaurant data."
        eyebrow="Analytics"
        title="Reports & insights"
      />

      <section className="surface-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800">Reporting period</p>
            <p className="mt-1 text-sm text-slate-500">Showing data for {range.label.toLowerCase()}.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Report date range">
            {filterOptions.map(([value, label]) => <button className={`rounded-xl px-3 py-2 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-orange-300 ${dateFilter === value ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'bg-slate-50 text-slate-600 hover:bg-orange-50 hover:text-orange-700'}`} key={value} onClick={() => setDateFilter(value)} type="button">{label}</button>)}
          </div>
        </div>
        {dateFilter === 'custom' && <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:max-w-xl"><label className="text-sm font-bold text-slate-700">From<input className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" max={customEnd || undefined} onChange={(event) => setCustomStart(event.target.value)} type="date" value={customStart} /></label><label className="text-sm font-bold text-slate-700">To<input className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" min={customStart || undefined} onChange={(event) => setCustomEnd(event.target.value)} type="date" value={customEnd} /></label></div>}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold text-slate-900">Dashboard summary</h2><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">Live</span></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([value, label, note]) => <MetricCard key={label} label={label} note={note} value={value} />)}</div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <article className="surface-card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold">Sales performance</h2><p className="mt-1 text-sm text-slate-500">Daily served revenue for the selected period.</p></div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">{formatCurrency(analytics.summary.totalRevenue)}</span></div>{analytics.salesByDay.length > 0 ? <BarChart data={analytics.salesByDay} formatValue={formatCurrency} title="Daily revenue" /> : <p className="py-16 text-center text-sm text-slate-500">No revenue data for this period.</p>}</article>
        <article className="surface-card p-5 sm:p-6"><h2 className="text-lg font-extrabold">Order status</h2><p className="mt-1 text-sm text-slate-500">Order distribution for this period.</p><div className="mt-6"><DonutChart data={analytics.statusCounts} title="Order status distribution" /></div></article>
      </section>

      <section><div className="mb-3"><h2 className="text-lg font-extrabold">Sales analytics</h2><p className="mt-1 text-sm text-slate-500">Served revenue across the current calendar periods.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Daily revenue', analytics.salesTotals.daily], ['Weekly revenue', analytics.salesTotals.weekly], ['Monthly revenue', analytics.salesTotals.monthly], ['Yearly revenue', analytics.salesTotals.yearly]].map(([label, value]) => <MetricCard key={label} label={label} value={formatCurrency(value)} />)}</div></section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="surface-card overflow-hidden"><div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6"><div><h2 className="text-lg font-extrabold">Top selling foods</h2><p className="mt-1 text-sm text-slate-500">Top 10 items by quantity sold.</p></div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">Top 10</span></div>{analytics.topFoods.length === 0 ? <p className="p-6 text-sm text-slate-500">No completed food sales for this period.</p> : <div className="divide-y divide-slate-100">{analytics.topFoods.map((food, index) => <div className="flex items-center gap-3 p-4 transition hover:bg-slate-50" key={food.name}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-sm font-extrabold text-orange-600">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{food.name}</p><p className="mt-1 text-xs text-slate-400">{food.quantity} sold</p></div><span className="whitespace-nowrap text-sm font-extrabold text-slate-800">{formatCurrency(food.revenue)}</span></div>)}</div>}</article>
        <article className="surface-card p-5 sm:p-6"><h2 className="text-lg font-extrabold">Sales by category</h2><p className="mt-1 text-sm text-slate-500">Category revenue from served menu items.</p>{analytics.categoryAnalytics.length === 0 ? <p className="py-16 text-center text-sm text-slate-500">No category sales for this period.</p> : <div className="mt-7"><RevenueList data={analytics.categoryAnalytics} /></div>}</article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <article className="surface-card overflow-hidden"><div className="border-b border-slate-100 p-5 sm:p-6"><h2 className="text-lg font-extrabold">Table analytics</h2><p className="mt-1 text-sm text-slate-500">Most frequently used tables in the selected period.</p></div>{analytics.tableAnalytics.length === 0 ? <p className="p-6 text-sm text-slate-500">No table activity for this period.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3 font-bold">Table</th><th className="px-5 py-3 font-bold">Orders</th><th className="px-5 py-3 font-bold">Average spending</th></tr></thead><tbody>{analytics.tableAnalytics.slice(0, 10).map((table) => <tr className="border-t border-slate-100" key={table.tableNumber}><td className="px-5 py-4 font-bold text-slate-800">Table {table.tableNumber}</td><td className="px-5 py-4 text-slate-600">{table.orders}</td><td className="px-5 py-4 font-bold text-orange-600">{formatCurrency(table.averageSpend)}</td></tr>)}</tbody></table></div>}</article>
        <article className="surface-card p-5 sm:p-6"><h2 className="text-lg font-extrabold">Peak ordering hours</h2><p className="mt-1 text-sm text-slate-500">Orders grouped by hour.</p>{analytics.peakHours.length === 0 ? <p className="py-16 text-center text-sm text-slate-500">No ordering activity for this period.</p> : <div className="mt-4"><BarChart data={analytics.peakHours} title="Peak ordering hours" /></div>}</article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="surface-card p-5 sm:p-6"><h2 className="text-lg font-extrabold">Service request analytics</h2><p className="mt-1 text-sm text-slate-500">Customer requests created in the selected period.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{requestLabels.map(([key, label, icon]) => <div className="rounded-2xl bg-slate-50 p-4" key={key}><span className="text-lg">{icon}</span><p className="mt-3 text-2xl font-extrabold text-slate-900">{analytics.requestCounts[key]}</p><p className="mt-1 text-sm font-semibold text-slate-600">{label}</p></div>)}</div></article>
        <article className="surface-card p-5 sm:p-6"><h2 className="text-lg font-extrabold">Customer analytics</h2><p className="mt-1 text-sm text-slate-500">Customer behaviour for the selected period.</p><div className="mt-6 grid gap-3 sm:grid-cols-3">{[[analytics.summary.uniqueCustomers, 'Unique customers'], [analytics.summary.averageItemsPerOrder.toFixed(1), 'Avg. items / order'], [formatCurrency(analytics.summary.averageSpendPerCustomer), 'Avg. spend / customer']].map(([value, label]) => <div className="rounded-2xl border border-slate-100 p-4" key={label}><p className="text-xl font-extrabold text-slate-900">{value}</p><p className="mt-2 text-xs font-bold leading-5 text-slate-500">{label}</p></div>)}</div></article>
      </section>

      <section className="surface-card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6"><div><h2 className="text-lg font-extrabold">Recent orders</h2><p className="mt-1 text-sm text-slate-500">Latest orders in the selected reporting period.</p></div><span className="text-sm font-bold text-slate-400">{analytics.recentOrders.length} shown</span></div>{analytics.recentOrders.length === 0 ? <p className="p-6 text-sm text-slate-500">No orders for this period.</p> : <div className="divide-y divide-slate-100">{analytics.recentOrders.map((order) => <div className="flex flex-col gap-3 p-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between" key={order.id}><div><p className="font-bold text-slate-800">{getOrderNumber(order)} <span className="font-medium text-slate-400">· Table {order.tableNumber ?? order.tableId ?? '—'}</span></p><p className="mt-1 text-xs text-slate-500">{order.customerNickname ?? 'Guest'} · {formatDateTime(order.createdAt)}</p></div><div className="flex items-center gap-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{formatStatus(order.status)}</span><span className="font-extrabold text-orange-600">{formatCurrency(order.grandTotal)}</span></div></div>)}</div>}</section>
    </div>
  )
}

export default Reports
