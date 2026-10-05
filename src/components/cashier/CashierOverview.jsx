import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import TableFloorPlan from './TableFloorPlan'
import Button from '../common/Button'
import { formatCurrency } from '../../utils/currency'

function CashierOverview({ summary, recentOrders, children, ...floorProps }) {
  const [selectedId, setSelectedId] = useState(null)
  const panelRef = useRef(null)
  const table = floorProps.floorTables.find((entry) => entry.id === selectedId)
  const payment = table && floorProps.paymentTables.find((entry) => String(entry.tableNumber) === String(table.tableNumber) && entry.orders.every((order) => order.tableSessionId === table.tableSessionId))
  const clearable = table && floorProps.clearableTables.find((entry) => entry.tableId === table.id)
  const unpaidCount = floorProps.floorTables.reduce((sum, entry) => sum + Number(entry.unpaidOrderCount || 0), 0)
  const metrics = [
    ['Today’s sales', summary ? formatCurrency(summary.sales) : '—', `${summary?.transactions ?? '—'} paid bills · Malaysia time`],
    ['Average bill', summary ? formatCurrency(summary.averageBill) : '—', 'Across today’s payments'],
    ['Cash / Non-cash', summary ? `${formatCurrency(summary.cash)} / ${formatCurrency(summary.nonCash)}` : '—', 'Today’s payment breakdown'],
    ['Unpaid orders', unpaidCount, 'Current table visits · excludes cancelled'],
  ]
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value, detail], index) => <section key={label} className={`min-w-0 rounded-2xl border p-5 ${index === 0 ? 'border-orange-600 bg-orange-600 text-white' : 'border-slate-100 bg-white text-slate-900'}`}>
      <h2 className="text-sm font-semibold">{label}</h2><p className="mt-3 break-words text-2xl font-extrabold">{value}</p><p className={`mt-2 text-xs ${index === 0 ? 'text-orange-100' : 'text-slate-500'}`}>{detail}</p>
    </section>)}</div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <TableFloorPlan {...floorProps} selectedTableId={selectedId} onSelectTable={(id) => {
          setSelectedId(id)
          if (window.innerWidth < 1280) panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
        }} />
        <section className="surface-card p-5"><h2 className="text-lg font-extrabold">Recent orders</h2><p className="mt-1 text-xs text-slate-500">Latest 8 orders · all payment statuses</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{recentOrders.map((order) => {
            const date = new Date(order.createdAt)
            return <article key={order.id} className="min-w-0 rounded-xl border border-slate-200 p-4">
              <p className="break-words text-sm font-bold">{order.orderNumber || `#${order.id.slice(-6).toUpperCase()}`}</p>
              <p className="mt-1 text-xs text-slate-500">Table {order.tableNumber} · {Number.isFinite(date.getTime()) ? date.toLocaleString('en-MY', { timeZone: 'Asia/Kuching', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Date unavailable'}</p>
              <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm"><strong>{formatCurrency(order.grandTotal)}</strong><span className="capitalize text-slate-600">{order.status} · {order.paymentStatus}</span></div>
            </article>
          })}</div>{recentOrders.length === 0 && <p className="mt-4 text-sm text-slate-500">No recent orders.</p>}
        </section>
      </div>
      <aside className="min-w-0 space-y-5" ref={panelRef}>
        <section className="surface-card p-5">
          <h2 className="text-lg font-extrabold">{table ? `Table ${table.tableNumber}` : 'Table details'}</h2>
          {!table ? <p className="py-12 text-center text-sm text-slate-500">Select a table to view its current visit.</p> : <>
            <p className="mt-1 text-sm capitalize text-slate-500">{table.floorZone || 'Main hall'} · {table.status?.replaceAll('_', ' ')}</p>
            <dl className="mt-5 space-y-3 text-sm">{[['Unpaid orders', table.unpaidOrderCount ?? 0], ['Paid orders', table.paidOrderCount ?? 0], ['All unpaid', formatCurrency(table.unpaidTotal)], ['Served, ready to pay', formatCurrency(table.payableTotal)]].map(([label, value]) => <div className="flex justify-between gap-3" key={label}><dt className="text-slate-500">{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl>
            <div className="mt-5 space-y-2">{Object.entries(table.orderCounts ?? {}).filter(([, count]) => count > 0).map(([status, count]) => <p key={status} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs capitalize"><span>{status}</span><strong>{count}</strong></p>)}</div>
            {payment ? <Button className="mt-5 w-full" onClick={() => floorProps.onOpenTable(payment)}>View bill / Payment</Button> : clearable ? <Button className="mt-5 w-full" onClick={() => floorProps.onClearTable(clearable)}>Clear table</Button> : <p className="mt-5 text-sm text-slate-500">{table.tableSessionId ? 'No served orders awaiting payment.' : 'No active visit.'}</p>}
          </>}
        </section>
        <section className="surface-card p-5"><h2 className="text-lg font-extrabold">Quick actions</h2><div className="mt-4 grid grid-cols-2 gap-3"><Link className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-center text-sm font-bold text-orange-700 hover:bg-orange-100" to={table ? `/cashier/new-order?tableId=${encodeURIComponent(table.id)}` : '/cashier/new-order'}>New order</Link><Link className="rounded-xl border border-slate-200 p-4 text-center text-sm font-bold hover:bg-orange-50" to="/cashier/history">Receipts / Reprint</Link><Link className="col-span-2 rounded-xl border border-slate-200 p-4 text-center text-sm font-bold hover:bg-orange-50" to="/cashier/closing">Shift closing</Link></div></section>
      </aside>
    </div>
    <details className="surface-card p-5"><summary className="cursor-pointer font-bold">Member lookup & rewards</summary><div className="mt-4 space-y-4">{children}</div></details>
  </div>
}

export default CashierOverview
