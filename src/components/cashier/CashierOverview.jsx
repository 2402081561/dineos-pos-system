import OrderTypeBadge from '../common/OrderTypeBadge'
import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import HandoffQueue from '../staff/HandoffQueue'
import TableFloorPlan from './TableFloorPlan'
import Button from '../common/Button'
import TableOrderManager from './TableOrderManager'
import { formatCurrency } from '../../utils/currency'

function CashierOverview({ summary, recentOrders, billRequests = [], children, ...floorProps }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('tableId')
  const setSelectedId = (id) => setSearchParams({ tableId: id }, { replace: true })
  const [managingTable, setManagingTable] = useState(null)
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
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value, detail], index) => <section key={label} className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <h2 className="text-xs font-semibold text-slate-500">{label}</h2><p className={`mt-1 break-words text-xl font-bold ${index === 0 ? 'text-orange-600' : 'text-slate-900'}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p>
    </section>)}</div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <TableFloorPlan {...floorProps} selectedTableId={selectedId} onSelectTable={(id) => {
          setSelectedId(id)
          if (window.innerWidth < 1280) panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
        }} />
        <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-bold">Recent orders <span className="font-normal text-slate-500">({recentOrders.length})</span></summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{recentOrders.map((order) => {
            const date = new Date(order.createdAt)
            return <button type="button" key={order.id} className="min-w-0 rounded-xl border border-slate-200 p-4 text-left hover:border-orange-300" onClick={() => { setSelectedId(order.tableId); setManagingTable({ id: order.tableId, tableNumber: order.tableNumber, tableSessionId: order.tableSessionId }) }}>
              <p className="break-words text-sm font-bold">{order.orderNumber || `#${order.id.slice(-6).toUpperCase()}`}</p><OrderTypeBadge orderType={order.orderType} className="mt-2" />
              <p className="mt-1 text-xs text-slate-500">Table {order.tableNumber} · {Number.isFinite(date.getTime()) ? date.toLocaleString('en-MY', { timeZone: 'Asia/Kuching', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Date unavailable'}</p>
              <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm"><strong>{formatCurrency(order.grandTotal)}</strong><span className="capitalize text-slate-600">{order.status} · {order.paymentStatus}</span></div>
            </button>
          })}</div>{recentOrders.length === 0 && <p className="mt-4 text-sm text-slate-500">No recent orders.</p>}
        </details>
      </div>
      <aside className="min-w-0 space-y-4 xl:sticky xl:top-24" ref={panelRef}>
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-extrabold">{table ? `Table ${table.tableNumber}` : 'Table details'}</h2>
          {!table ? <p className="py-12 text-center text-sm text-slate-500">Select a table to view its current visit.</p> : <>
            <p className="mt-1 text-sm capitalize text-slate-500">{table.floorZone || 'Main hall'} · {table.status?.replaceAll('_', ' ')}</p>
            {billRequests.filter((request) => request.tableId === table.id).map((request) => <p key={request.id} className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-900">{request.details?.billMode === 'split' ? 'Customer requested split payment — select dishes and quantities together.' : 'Customer requested the whole table bill.'}</p>)}
            <dl className="mt-5 space-y-3 text-sm">{[['Unpaid orders', table.unpaidOrderCount ?? 0], ['Paid orders', table.paidOrderCount ?? 0], ['Remaining bill', formatCurrency(table.unpaidTotal)]].map(([label, value]) => <div className="flex justify-between gap-3" key={label}><dt className="text-slate-500">{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl>
            <div className="mt-4 flex flex-wrap gap-2">{Object.entries(table.orderCounts ?? {}).filter(([, count]) => count > 0).map(([status, count]) => <p key={status} className="rounded-md bg-slate-50 px-2 py-1 text-xs capitalize text-slate-600">{status} <strong>{count}</strong></p>)}</div>
            <Link className="mt-5 block rounded-lg border border-slate-200 px-3 py-3 text-center text-sm font-bold hover:bg-slate-50" to={`/cashier/new-order?tableId=${encodeURIComponent(table.id)}`}>Add order</Link>
            {table.tableSessionId && <Button className="mt-5 w-full" variant="outline" onClick={() => setManagingTable(table)}>View / edit all orders</Button>}
            {payment ? <Button className="mt-3 w-full" onClick={() => floorProps.onOpenTable(payment)}>Collect payment</Button> : clearable ? <Button className="mt-3 w-full" onClick={() => floorProps.onClearTable(clearable)}>Clear table</Button> : <p className="mt-5 text-sm text-slate-500">{table.tableSessionId ? 'Paid items may still be waiting for handoff.' : 'No active visit.'}</p>}
          </>}
        </section>
        <nav aria-label="Cashier shortcuts" className="flex flex-wrap gap-x-4 gap-y-3 px-1 text-sm font-semibold text-slate-600"><Link className="hover:text-orange-600" to="/cashier/new-order">New order</Link><Link className="hover:text-orange-600" to="/cashier/history">Receipts</Link><Link className="hover:text-orange-600" to="/cashier/closing">Shift closing</Link></nav>
      </aside>
    </div>
    {table?.tableSessionId && <HandoffQueue key={table.id} tableId={table.id} />}
    {managingTable && <TableOrderManager key={`${managingTable.id}:${managingTable.tableSessionId}`} table={managingTable} onPay={payment && managingTable.tableSessionId === table?.tableSessionId ? () => { setManagingTable(null); floorProps.onOpenTable(payment) } : null} onClose={() => setManagingTable(null)} />}
    <details className="surface-card p-5"><summary className="cursor-pointer font-bold">Member lookup & rewards</summary><div className="mt-4 space-y-4">{children}</div></details>
  </div>
}

export default CashierOverview
