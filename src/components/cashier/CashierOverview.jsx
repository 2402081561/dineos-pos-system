import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import OrderTypeBadge from '../common/OrderTypeBadge'
import { useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import RecentOrderDetailsPanel from '../common/RecentOrderDetailsPanel'
import HandoffQueue from '../staff/HandoffQueue'
import TableFloorPlan from './TableFloorPlan'
import Button from '../common/Button'
import TableOrderManager from './TableOrderManager'
import { formatCurrency } from '../../utils/currency'
import { orderPaymentLabel, orderStatusLabel, orderStatusStyle } from '../../utils/adminOrderPresentation'

function CashierOverview({ summary, recentOrders, billRequests = [], children, ...floorProps }) {
  const { t: uiText, locale } = useCustomerLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('tableId')
  const setSelectedId = (id) => setSearchParams({ tableId: id }, { replace: true })
  const [managingTable, setManagingTable] = useState(null)
  const { state } = useLocation()
  const [selectedOrderId, setSelectedOrderId] = useState(state?.orderId || null)
  const [showAllRecent, setShowAllRecent] = useState(false)
  const panelRef = useRef(null)
  const table = floorProps.floorTables.find((entry) => entry.id === selectedId)
  const payment = table && floorProps.paymentTables.find((entry) => String(entry.tableNumber) === String(table.tableNumber) && entry.orders.every((order) => order.tableSessionId === table.tableSessionId))
  const clearable = table && floorProps.clearableTables.find((entry) => entry.tableId === table.id)
  const unpaidCount = floorProps.floorTables.reduce((sum, entry) => sum + Number(entry.unpaidOrderCount || 0), 0)
  const visibleOrders = showAllRecent ? recentOrders : recentOrders.slice(0, 6)
  const metrics = [
    ['Today’s sales', summary ? formatCurrency(summary.sales) : '—', uiText('{{count}} paid bills · Malaysia time', { count: summary?.transactions ?? '—' })],
    ['Average bill', summary ? formatCurrency(summary.averageBill) : '—', 'Across today’s payments'],
    ['Cash / Non-cash', summary ? `${formatCurrency(summary.cash)} / ${formatCurrency(summary.nonCash)}` : '—', 'Today’s payment breakdown'],
    ['Unpaid orders', unpaidCount, 'Current table visits · excludes cancelled'],
  ]
  function revealPanel() {
    if (window.innerWidth < 1280) window.requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }
  return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
    <div className="min-w-0 space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map(([label, value, detail], index) => <section key={label} className={`min-w-0 rounded-2xl border p-4 ${index === 0 ? 'border-orange-600 bg-orange-600 text-white' : 'border-slate-200 bg-white text-slate-900'}`}>
        <h2 className={`text-xs font-semibold ${index === 0 ? 'text-orange-100' : 'text-slate-500'}`}>{uiText(label)}</h2>
        <p className={`mt-2 break-words font-bold leading-tight tabular-nums ${index === 2 ? 'text-base' : 'text-xl sm:text-2xl'}`}>{value}</p>
        <p className={`mt-2 text-[11px] leading-4 ${index === 0 ? 'text-orange-100' : 'text-slate-400'}`}>{uiText(detail)}</p>
      </section>)}</div>
      <TableFloorPlan {...floorProps} compact defaultView="cards" selectedTableId={selectedId} onSelectTable={(id) => {
        setSelectedId(id)
        setSelectedOrderId(null)
        revealPanel()
      }} />
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-label={uiText("Recent orders")}>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">{uiText("Recent orders")}<span className="ml-2 text-xs font-normal text-slate-400">({recentOrders.length})</span></h2>
          {recentOrders.length > 6 && <button type="button" aria-expanded={showAllRecent} onClick={() => setShowAllRecent((current) => !current)} className="rounded text-xs font-semibold text-orange-700 hover:underline focus-visible:ring-2 focus-visible:ring-orange-400">{showAllRecent ? uiText("Show fewer") : uiText("View all →")}</button>}
        </header>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleOrders.map((order) => {
          const date = new Date(order.createdAt)
          return <button type="button" key={order.id} aria-pressed={selectedOrderId === order.id} className={`min-w-0 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-orange-500 ${selectedOrderId === order.id ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50/30'}`} onClick={() => {
            setSelectedOrderId(order.id)
            revealPanel()
          }}>
            <p className="break-words text-sm font-bold text-slate-900">{order.orderNumber || `#${order.id.slice(-6).toUpperCase()}`}</p>
            <p className="mt-1 text-[11px] text-slate-500">{uiText("Table {{number}}", { number: order.tableNumber ?? '—' })} · {Number.isFinite(date.getTime()) ? date.toLocaleString(locale, { timeZone: 'Asia/Kuching', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : uiText("Date unavailable")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5"><OrderTypeBadge orderType={order.orderType} className="!rounded-md !px-1.5 !py-0.5 !text-[10px]" /><span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${orderStatusStyle(order.status)}`}>{uiText(orderStatusLabel(order.status))}</span></div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-2"><strong className="text-sm tabular-nums text-slate-900">{formatCurrency(order.grandTotal)}</strong><span className={`text-[11px] font-medium ${order.paymentStatus === 'paid' ? 'text-emerald-700' : 'text-slate-500'}`}>{uiText(orderPaymentLabel(order))}</span></div>
          </button>
        })}</div>
        {recentOrders.length === 0 && <p className="py-6 text-sm text-slate-500">{uiText("No recent orders.")}</p>}
      </section>
      {table?.tableSessionId && <HandoffQueue key={table.id} tableId={table.id} />}
    </div>
    <aside className="min-w-0 scroll-mt-24 space-y-4 xl:sticky xl:top-24" ref={panelRef}>
      {selectedOrderId ? <RecentOrderDetailsPanel compact orderId={selectedOrderId} returnTo="/cashier" onClose={() => setSelectedOrderId(null)} /> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <header className="border-b border-slate-100 p-5"><h2 className="text-lg font-bold">{table ? uiText("Table {{number}}", { number: table.tableNumber }) : uiText("Table details")}</h2>
          {table && <p className="mt-1 text-xs text-slate-500">{uiText(table.floorZone || 'Main hall')} · {uiText(table.status?.replaceAll('_', ' '))}</p>}
        </header>
        {!table ? <div className="px-5 py-12 text-center"><span aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-xl text-slate-400">▦</span><p className="mt-4 text-sm leading-6 text-slate-500">{uiText("Select a table to view its current visit.")}</p></div> : <>
          <div className="space-y-4 p-5">
            {billRequests.filter((request) => request.tableId === table.id).map((request) => <p key={request.id} className="rounded-lg bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">{request.details?.billMode === 'split' ? uiText("Customer requested split payment — select dishes and quantities together.") : uiText("Customer requested the whole table bill.")}</p>)}
            <dl><div className="flex items-end justify-between gap-3"><dt className="text-sm text-slate-500">{uiText("Remaining bill")}</dt><dd className="text-2xl font-bold tabular-nums">{formatCurrency(table.unpaidTotal)}</dd></div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">{[['Unpaid orders', table.unpaidOrderCount ?? 0], ['Paid orders', table.paidOrderCount ?? 0]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{uiText(label)}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}</div>
            </dl>
            <div className="flex flex-wrap gap-2">{Object.entries(table.orderCounts ?? {}).filter(([, count]) => count > 0).map(([status, count]) => <p key={status} className={`rounded-md px-2 py-1 text-[11px] font-medium ${orderStatusStyle(status)}`}>{uiText(orderStatusLabel(status))} <strong>{count}</strong></p>)}</div>
          </div>
          <div className="border-t border-slate-100 p-4">
            <div className="grid grid-cols-2 gap-2"><Link className="flex items-center justify-center rounded-lg border border-slate-200 px-3 py-3 text-center text-xs font-semibold hover:border-orange-300 hover:bg-orange-50" to={`/cashier/new-order?tableId=${encodeURIComponent(table.id)}`}>{uiText("Add order")}</Link>
              {table.tableSessionId && <Button className="!rounded-lg !px-3 !text-xs !shadow-none" variant="outline" onClick={() => setManagingTable(table)}>{uiText("View / edit all orders")}</Button>}
            </div>
            {payment ? <Button className="mt-3 w-full !rounded-lg !shadow-none" onClick={() => floorProps.onOpenTable(payment)}>{uiText("Collect payment")}</Button> : clearable ? <Button className="mt-3 w-full !rounded-lg !shadow-none" onClick={() => floorProps.onClearTable(clearable)}>{uiText("Clear table")}</Button> : <p className="mt-3 text-xs leading-5 text-slate-500">{table.tableSessionId ? uiText("Paid items may still be waiting for handoff.") : uiText("No active visit.")}</p>}
          </div>
        </>}
      </section>}
      <nav aria-label={uiText("Cashier shortcuts")} className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold">{uiText("Quick actions")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">{[['/cashier/new-order', '+', 'New order'], ['/cashier/history', '▤', 'Receipts']].map(([to, icon, label]) => <Link key={to} className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 px-3 py-4 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:bg-orange-50" to={to}><span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-xl text-orange-600">{icon}</span>{uiText(label)}</Link>)}</div>
        <Link className="mt-3 block rounded text-center text-xs font-semibold text-slate-500 hover:text-orange-700" to="/cashier/closing">{uiText("Shift closing")} →</Link>
      </nav>
      <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-xs font-semibold text-slate-600">{uiText("Member lookup & rewards")}</summary><div className="mt-4 space-y-4">{children}</div></details>
    </aside>
    {managingTable && <TableOrderManager key={`${managingTable.id}:${managingTable.tableSessionId}`} table={managingTable} onPay={payment && managingTable.tableSessionId === table?.tableSessionId ? () => { setManagingTable(null); floorProps.onOpenTable(payment) } : null} onClose={() => setManagingTable(null)} />}
  </div>
}

export default CashierOverview
