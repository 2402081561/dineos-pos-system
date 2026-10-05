import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Button from '../common/Button'
import { formatCurrency } from '../../utils/currency'
import { floorZone } from '../../utils/tableFloorLayout'

const orderLabels = { received: 'Received', preparing: 'Preparing', ready: 'Ready', served: 'Served', cancelled: 'Cancelled' }

function TableSummaryDialog({ table, statusLabel, payment, clearable, onClose, onOpenTable, onClearTable }) {
  const dialogRef = useRef(null)
  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  return createPortal(<dialog
    aria-labelledby="cashier-table-summary-title"
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/45"
    onCancel={(event) => { event.preventDefault(); onClose() }}
    ref={dialogRef}
  >
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><p className="eyebrow">Table summary</p><h2 className="mt-1 text-2xl font-extrabold" id="cashier-table-summary-title">{table ? `Table ${table.tableNumber}` : 'Table unavailable'}</h2>{table && <p className="mt-1 break-words text-sm text-slate-500">{floorZone(table)} · {statusLabel}</p>}</div>
        <Button onClick={onClose} variant="outline">Close</Button>
      </div>
      {!table ? <p className="mt-5 text-sm text-slate-600">This table is no longer available. Close this summary to see the updated floor plan.</p> : <>
        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
          <div><dt className="text-slate-500">Seats</dt><dd className="mt-1 text-lg font-bold">{table.capacity ?? '—'}</dd></div>
          <div><dt className="text-slate-500">Ordering sessions</dt><dd className="mt-1 text-lg font-bold">{table.participantCount ?? '—'}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-slate-500">A shared ordering session can include several guests.</p>
        {table.orderCounts ? <>
          <h3 className="mt-5 text-sm font-bold">Orders during this visit</h3>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            {Object.entries(orderLabels).map(([status, label]) => <div className="rounded-xl border border-slate-100 p-3" key={status}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-bold">{table.orderCounts[status] ?? 0}</dd></div>)}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><dt className="text-xs text-emerald-700">Paid orders</dt><dd className="mt-1 font-bold text-emerald-900">{table.paidOrderCount ?? 0}</dd></div>
          </dl>
          <div className="mt-5 rounded-2xl bg-orange-50 p-4">
            <div className="flex justify-between gap-3 text-sm"><span>All unpaid orders</span><strong>{formatCurrency(table.unpaidTotal)}</strong></div>
            <p className="mt-1 text-xs text-slate-500">Includes orders still being prepared. Cancelled orders are excluded.</p>
            <div className="mt-4 flex justify-between gap-3 border-t border-orange-100 pt-3 text-sm font-bold"><span>Served and ready to pay</span><span>{formatCurrency(table.payableTotal)}</span></div>
          </div>
        </> : <p className="mt-5 text-sm text-slate-500">Order summary is currently unavailable.</p>}
        <div className="mt-5 flex flex-col gap-2">
          {payment ? <Button onClick={() => { onClose(); onOpenTable(payment) }}>View served bill</Button> : clearable ? <Button onClick={() => { onClose(); onClearTable(clearable) }} variant="outline">Clear table</Button> : <p className="text-sm text-slate-500">{table.tableSessionId ? 'No served orders awaiting payment.' : 'No active visit at this table.'}</p>}
        </div>
      </>}
    </div>
  </dialog>, document.body)
}

export default TableSummaryDialog
