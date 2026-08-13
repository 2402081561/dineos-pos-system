import { useState } from 'react'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useTableSummary from '../../hooks/useTableSummary'
import { formatCurrency } from '../../utils/currency'

function getInitials(name) {
  return String(name ?? 'Guest')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function formatStatus(status) {
  if (status === 'No orders yet') return status
  return String(status).replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function statusClass(status) {
  if (status === 'served') return 'bg-emerald-50 text-emerald-700'
  if (status === 'ready') return 'bg-blue-50 text-blue-700'
  if (status === 'preparing') return 'bg-amber-50 text-amber-700'
  if (status === 'received') return 'bg-slate-100 text-slate-600'
  return 'bg-slate-100 text-slate-500'
}

function paymentLabel(status) {
  if (status === 'paid') return 'Paid'
  if (status === 'pending') return 'Payment pending'
  return 'No orders yet'
}

function paymentClass(status) {
  if (status === 'paid') return 'bg-emerald-50 text-emerald-700'
  if (status === 'pending') return 'bg-amber-50 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

function TableSummarySkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-pulse">
      <div className="h-20 rounded-3xl bg-slate-200" />
      <div className="h-36 rounded-3xl bg-orange-50" />
      {Array.from({ length: 3 }, (_, index) => (
        <div className="h-24 rounded-3xl bg-white" key={index} />
      ))}
    </div>
  )
}

function TableSummary() {
  const { currentSessionId, error, grandTotal, hasSession, hasTableSession, isLoading, participants, paymentStatus, tableNumber } = useTableSummary()
  const [isOwnOrderExpanded, setIsOwnOrderExpanded] = useState(false)

  if (isLoading) return <TableSummarySkeleton />
  if (!hasSession)
    return (
      <div className="mx-auto max-w-4xl">
        <StatePanel description="Scan your table QR code and join a session to view the table summary." title="No active table session" />
      </div>
    )
  if (error)
    return (
      <div className="mx-auto max-w-4xl">
        <StatePanel description={error} title="Table summary unavailable" tone="error" />
      </div>
    )
  if (!hasTableSession)
    return (
      <div className="mx-auto max-w-4xl">
        <StatePanel description="This table session is no longer active. Scan the table QR code to join again." title="No active table session" />
      </div>
    )

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <SectionHeading description="See who is dining with you and keep an eye on your table's unpaid total." eyebrow={`Table ${tableNumber}`} title="Table summary" />
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 to-orange-500 p-6 text-white shadow-xl shadow-orange-600/20 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-100">Current unpaid table total</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <p className="text-4xl font-extrabold tracking-tight sm:text-5xl">{formatCurrency(grandTotal)}</p>
          <span className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold backdrop-blur">
            {participants.length} diner{participants.length === 1 ? '' : 's'}
          </span>
        </div>
        <p className="mt-4 text-sm text-orange-50">
          Payment status: <strong>{paymentLabel(paymentStatus)}</strong>
          {paymentStatus === 'paid' ? ' · Previous orders remain available in My Orders.' : ''}
        </p>
      </section>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">Dining together</p>
            <h2 className="mt-1 text-xl font-bold">Participants</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Live updates</span>
        </div>
        <div className="space-y-4">
          {participants.length === 0 ? (
            <StatePanel description="Participants will appear here as they join this table." title="No participants yet" />
          ) : (
            participants.map((participant) => {
              const isOwnOrder = participant.sessionId === currentSessionId
              return (
                <article className={`overflow-hidden rounded-3xl border bg-white shadow-sm transition ${isOwnOrder ? 'border-orange-200 ring-2 ring-orange-50' : 'border-slate-100'}`} key={participant.sessionId}>
                  <div className="flex flex-wrap items-center gap-4 p-5 sm:flex-nowrap">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold ${isOwnOrder ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{getInitials(participant.customerNickname)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-bold text-slate-900">{participant.customerNickname}</h3>
                        {isOwnOrder && <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-700">You</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(participant.status)}`}>{formatStatus(participant.status)}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${paymentClass(participant.paymentStatus)}`}>{paymentLabel(participant.paymentStatus)}</span>
                      </div>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Individual total</p>
                      <p className="mt-1 text-lg font-extrabold text-orange-600">{formatCurrency(participant.grandTotal)}</p>
                    </div>
                  </div>
                  {isOwnOrder && (
                    <div className="border-t border-orange-100 bg-orange-50/40 px-5 py-4">
                      <Button className="w-full sm:w-auto" onClick={() => setIsOwnOrderExpanded((isExpanded) => !isExpanded)} variant="outline">
                        {isOwnOrderExpanded ? 'Hide my order details' : 'View my order details'}
                      </Button>
                      {isOwnOrderExpanded && (
                        <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
                          <div className="divide-y divide-slate-100">
                            {participant.orders.length === 0 ? (
                              <p className="py-2 text-sm text-slate-500">You have not placed an order yet.</p>
                            ) : (
                              participant.orders.flatMap((order) =>
                                order.items?.map((item, index) => (
                                  <div className="flex items-start justify-between gap-4 py-3" key={`${order.id}-${item.menuItemId}-${index}`}>
                                    <div>
                                      <p className="text-sm font-semibold text-slate-800">
                                        {item.quantity}× {item.name}
                                      </p>
                                      {item.notes && <p className="mt-1 text-xs text-slate-500">Note: {item.notes}</p>}
                                    </div>
                                    <span className="whitespace-nowrap text-sm font-bold text-slate-700">{formatCurrency(Number(item.price) * Number(item.quantity))}</span>
                                  </div>
                                )),
                              )
                            )}
                          </div>
                          <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
                            <p className="flex justify-between text-slate-500">
                              <span>Subtotal</span>
                              <strong className="text-slate-700">{formatCurrency(participant.subtotal)}</strong>
                            </p>
                            <p className="flex justify-between text-slate-500">
                              <span>Service charge</span>
                              <strong className="text-slate-700">{formatCurrency(participant.serviceCharge)}</strong>
                            </p>
                            <p className="flex justify-between text-slate-500">
                              <span>SST</span>
                              <strong className="text-slate-700">{formatCurrency(participant.sst)}</strong>
                            </p>
                            <p className="flex justify-between font-bold text-slate-800">
                              <span>Grand total</span>
                              <strong className="text-orange-600">{formatCurrency(participant.grandTotal)}</strong>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}

export default TableSummary
