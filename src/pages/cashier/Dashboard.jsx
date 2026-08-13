import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/common/Button'
import ConfirmationDialog from '../../components/common/ConfirmationDialog'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import PaymentConfirmationDialog from '../../components/cashier/PaymentConfirmationDialog'
import DiscountControl from '../../components/cashier/DiscountControl'
import useAdminAuth from '../../hooks/useAdminAuth'
import MemberLookup from '../../components/cashier/MemberLookup'
import RewardRedemption from '../../components/cashier/RewardRedemption'
import useCashierTables from '../../hooks/useCashierTables'
import { calculateTableDiscount } from '../../services/orderService'
import { clearSupabaseCashierTable, completeSupabaseTablePayment } from '../../services/adminApiService'
import { formatCurrency } from '../../utils/currency'

const paymentMethods = ['Cash', 'Credit/Debit Card', "Touch 'n Go", 'GrabPay', 'FPX', 'Other']

function formatDateTime(value) {
  const date = value?.toDate?.() ?? new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Just now'
    : new Intl.DateTimeFormat('en-MY', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date)
}

function groupParticipants(orders) {
  return [
    ...orders
      .reduce((groups, order) => {
        const key = order.sessionId || order.customerNickname || order.id
        const participant = groups.get(key) ?? {
          customerNickname: order.customerNickname || 'Guest',
          orders: [],
        }
        participant.orders.push(order)
        groups.set(key, participant)
        return groups
      }, new Map())
      .values(),
  ].map((participant) => ({
    ...participant,
    subtotal: participant.orders.reduce((sum, order) => sum + (Number(order.subtotal) || 0), 0),
    serviceCharge: participant.orders.reduce((sum, order) => sum + (Number(order.serviceCharge) || 0), 0),
    sst: participant.orders.reduce((sum, order) => sum + (Number(order.sst) || 0), 0),
    grandTotal: participant.orders.reduce((sum, order) => sum + (Number(order.grandTotal) || 0), 0),
  }))
}

function CashierDashboard() {
  const { authUser: user } = useAdminAuth()
  const { clearableTables, error, isLoading, tables } = useCashierTables()
  const [selectedTableNumber, setSelectedTableNumber] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [discount, setDiscount] = useState({ type: 'percentage', value: '0' })
  const [isConfirming, setIsConfirming] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [paymentSuccess, setPaymentSuccess] = useState(null)
  const [lookupMember, setLookupMember] = useState(null)
  const [clearingTable, setClearingTable] = useState(null)
  const [clearedTableIds, setClearedTableIds] = useState([])
  const [isClearing, setIsClearing] = useState(false)
  const [clearError, setClearError] = useState('')

  const selectedTable = tables.find((table) => table.tableNumber === selectedTableNumber)
  const associatedMemberIds = useMemo(
    () => [
      ...new Set(
        (selectedTable?.orders ?? []).map((order) =>
          String(order.memberId ?? '')
            .trim()
            .toUpperCase(),
        ),
      ),
    ],
    [selectedTable?.orders],
  )
  const associatedMemberId = associatedMemberIds.length === 1 && associatedMemberIds[0] ? associatedMemberIds[0] : ''
  const billParticipants = useMemo(() => groupParticipants(selectedTable?.orders ?? []), [selectedTable?.orders])
  const tableSubtotal = useMemo(() => (selectedTable?.orders ?? []).reduce((sum, order) => sum + Math.max(0, Number(order.subtotal) || 0), 0), [selectedTable?.orders])
  const discountPreview = useMemo(() => {
    try {
      return {
        value: calculateTableDiscount(tableSubtotal, discount),
        error: '',
      }
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : 'Enter a valid discount.',
      }
    }
  }, [discount, tableSubtotal])
  const previewGrandTotal = useMemo(() => {
    const discountedSubtotal = Math.max(0, tableSubtotal - (discountPreview.value?.amount ?? 0))
    return discountedSubtotal + discountedSubtotal * 0.1 + discountedSubtotal * 0.06
  }, [discountPreview.value?.amount, tableSubtotal])
  const tablesReadyToClear = clearableTables.filter((table) => !clearedTableIds.includes(table.tableId))

  function openTable(table) {
    setSelectedTableNumber(table.tableNumber)
    setPaymentError('')
    setPaymentSuccess(null)
    setDiscount({ type: 'percentage', value: '0' })
  }

  async function completePayment() {
    if (!selectedTable || !user?.id) return
    if (discountPreview.error) {
      setPaymentError(discountPreview.error)
      setIsConfirming(false)
      return
    }
    try {
      setIsCompleting(true)
      setPaymentError('')
      const paymentResult = await completeSupabaseTablePayment({
        orderIds: selectedTable.orders.map((order) => order.id),
        discount,
        paymentMethod,
      })
      setPaymentSuccess({
        tableId: paymentResult.tableId,
        method: paymentMethod,
        paidTime: paymentResult.paidAt,
        receiptNumber: paymentResult.receiptNumber,
        total: paymentResult.amount,
        loyalty: paymentResult.loyalty,
      })
      setIsConfirming(false)
    } catch (firebaseError) {
      console.error('[Cashier] Failed to complete payment:', firebaseError)
      setPaymentError(firebaseError.message || 'We could not complete this payment. Please try again.')
      setIsConfirming(false)
    } finally {
      setIsCompleting(false)
    }
  }

  async function clearTable() {
    if (!clearingTable?.tableId) return
    try {
      setIsClearing(true)
      setClearError('')
      await clearSupabaseCashierTable(clearingTable.tableId)
      setClearedTableIds((current) => [...new Set([...current, clearingTable.tableId])])
      setClearingTable(null)
    } catch (apiError) {
      console.error('[Cashier] Failed to clear table:', apiError)
      setClearError(apiError.message || 'We could not clear this table. Check for new unpaid orders and try again.')
      setClearingTable(null)
    } finally {
      setIsClearing(false)
    }
  }

  const clearTableDialog = clearingTable ? (
    <ConfirmationDialog
      confirmLabel="Clear table"
      description={`Clear Table ${clearingTable.tableNumber}? This ends the current table session and makes the table available for the next customer. Orders, receipts, payments and reports remain saved.`}
      isLoading={isClearing}
      onCancel={() => {
        if (!isClearing) setClearingTable(null)
      }}
      onConfirm={clearTable}
      title={`Clear Table ${clearingTable.tableNumber}?`}
    />
  ) : null

  if (isLoading)
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-24 rounded-3xl bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="h-52 rounded-3xl bg-white" key={index} />
          ))}
        </div>
      </div>
    )
  if (error) return <StatePanel description={error} title="Cashier queue unavailable" tone="error" />

  if (!selectedTableNumber || (!selectedTable && !paymentSuccess)) {
    return (
      <div className="space-y-7">
        <SectionHeading description="Served orders waiting for payment appear here automatically." eyebrow="Cashier POS" title="Payment queue" />
        <MemberLookup onMemberChange={setLookupMember} />
        {lookupMember && (
          <RewardRedemption
            member={lookupMember}
            onComplete={(result) =>
              setLookupMember((current) => ({
                ...current,
                pointsBalance: result.pointsBalance,
              }))
            }
          />
        )}
        {clearError && (
          <p aria-live="polite" className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
            {clearError}
          </p>
        )}
        {tablesReadyToClear.length > 0 && (
          <section>
            <div className="mb-4">
              <p className="eyebrow">Table turnover</p>
              <h2 className="mt-1 text-xl font-extrabold text-slate-900">Ready to clear</h2>
              <p className="mt-1 text-sm text-slate-500">These tables have no unpaid active orders.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {tablesReadyToClear.map((table) => (
                <article className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm" key={table.tableId}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Paid</p>
                      <h3 className="mt-1 text-xl font-extrabold text-emerald-950">Table {table.tableNumber}</h3>
                    </div>
                    <Button
                      onClick={() => {
                        setClearError('')
                        setClearingTable(table)
                      }}
                      variant="outline"
                    >
                      Clear table
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        {tables.length === 0 && tablesReadyToClear.length === 0 ? (
          <StatePanel description="All served tables have been paid, or there are no served orders yet." title="No tables awaiting payment." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {tables.map((table) => (
              <button className="group rounded-3xl border border-slate-100 bg-white p-5 text-left shadow-[0_10px_28px_rgb(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_16px_36px_rgb(15,23,42,0.11)] focus:outline-none focus:ring-2 focus:ring-orange-300" key={table.tableNumber} onClick={() => openTable(table)} type="button">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-lg font-extrabold text-orange-600">{table.tableNumber}</span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Awaiting payment</span>
                </div>
                <h2 className="mt-5 text-xl font-extrabold text-slate-900">Table {table.tableNumber}</h2>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-400">Customers</p>
                    <p className="mt-1 font-bold text-slate-800">{table.customerCount}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Served orders</p>
                    <p className="mt-1 font-bold text-slate-800">{table.orders.length}</p>
                  </div>
                </div>
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Grand total</p>
                  <p className="mt-1 text-2xl font-extrabold text-orange-600">{formatCurrency(table.grandTotal)}</p>
                  <p className="mt-2 text-xs text-slate-400">Updated {formatDateTime(table.lastUpdatedAt)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {clearTableDialog}
      </div>
    )
  }

  if (paymentSuccess)
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <SectionHeading
          action={
            <Button
              onClick={() => {
                setPaymentSuccess(null)
                setSelectedTableNumber('')
              }}
              variant="outline"
            >
              Back to payment queue
            </Button>
          }
          description="The table has been removed from the active payment queue."
          eyebrow="Cashier POS"
          title="Payment successful"
        />
        <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-7 text-center shadow-sm">
          <p className="text-5xl">✓</p>
          <h2 className="mt-4 text-3xl font-extrabold text-emerald-900">Payment Successful</h2>
          <p className="mt-2 text-sm text-emerald-800">Table {selectedTableNumber} has been marked as paid.</p>
          {clearError && (
            <p aria-live="polite" className="mx-auto mt-5 max-w-sm rounded-2xl border border-red-100 bg-red-50 p-4 text-left text-sm font-medium text-red-700">
              {clearError}
            </p>
          )}
          {paymentSuccess.loyalty?.points > 0 && (
            <div className="mx-auto mt-5 max-w-sm rounded-2xl border border-orange-100 bg-orange-50 p-4 text-left">
              <p className="font-bold text-orange-900">
                {paymentSuccess.loyalty.memberName} earned {paymentSuccess.loyalty.points} points.
              </p>
              <p className="mt-1 text-sm text-orange-800">Current balance: {paymentSuccess.loyalty.pointsBalance} points</p>
            </div>
          )}
          <div className="mx-auto mt-7 max-w-sm rounded-2xl bg-white p-5 text-left shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Receipt number</p>
            <p className="mt-1 text-xl font-extrabold text-slate-900">{paymentSuccess.receiptNumber}</p>
            <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-400">Payment method</p>
            <p className="mt-1 font-bold text-slate-800">{paymentSuccess.method}</p>
            <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-400">Paid time</p>
            <p className="mt-1 font-bold text-slate-800">{paymentSuccess.paidTime.toLocaleString('en-MY')}</p>
            <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-400">Paid amount</p>
            <p className="mt-1 text-2xl font-extrabold text-orange-600">{formatCurrency(paymentSuccess.total)}</p>
            <Link className="mt-6 inline-flex w-full" to={`/cashier/receipt/${encodeURIComponent(paymentSuccess.receiptNumber)}`}>
              <Button className="w-full">View receipt</Button>
            </Link>
            {clearedTableIds.includes(paymentSuccess.tableId) ? (
              <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700">Table cleared and ready for the next customer.</p>
            ) : (
              <Button
                className="mt-3 w-full"
                onClick={() => {
                  setClearError('')
                  setClearingTable({
                    tableId: paymentSuccess.tableId,
                    tableNumber: selectedTableNumber,
                  })
                }}
                variant="outline"
              >
                Clear Table {selectedTableNumber}
              </Button>
            )}
          </div>
        </section>
        {clearTableDialog}
      </div>
    )

  return (
    <div className="space-y-7">
      <SectionHeading
        action={
          <Button onClick={() => setSelectedTableNumber('')} variant="outline">
            ← Payment queue
          </Button>
        }
        description="Review all served orders before completing this table's payment."
        eyebrow="Cashier POS"
        title={`Table ${selectedTable.tableNumber} bill`}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          {billParticipants.map((participant, participantIndex) => (
            <article className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm" key={`${participant.customerNickname}-${participantIndex}`}>
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Participant</p>
                  <h2 className="mt-1 text-lg font-extrabold text-slate-900">{participant.customerNickname}</h2>
                </div>
                <span className="font-extrabold text-orange-600">{formatCurrency(participant.grandTotal)}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {participant.orders
                  .flatMap((order) => order.items ?? [])
                  .map((item, index) => (
                    <div className="flex items-start justify-between gap-4 p-4" key={`${item.menuItemId}-${index}`}>
                      <div>
                        <p className="font-semibold text-slate-800">
                          {item.quantity}× {item.name}
                        </p>
                        {item.notes && <p className="mt-1 text-xs text-slate-500">Note: {item.notes}</p>}
                      </div>
                      <p className="whitespace-nowrap font-bold text-slate-700">{formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 0))}</p>
                    </div>
                  ))}
              </div>
              <div className="grid gap-2 border-t border-slate-100 bg-slate-50 p-5 text-sm">
                <p className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(participant.subtotal)}</span>
                </p>
                <p className="flex justify-between text-slate-600">
                  <span>Service charge</span>
                  <span>{formatCurrency(participant.serviceCharge)}</span>
                </p>
                <p className="flex justify-between text-slate-600">
                  <span>SST</span>
                  <span>{formatCurrency(participant.sst)}</span>
                </p>
                <p className="mt-1 flex justify-between border-t border-slate-200 pt-3 font-bold text-slate-900">
                  <span>Grand total</span>
                  <span className="text-orange-600">{formatCurrency(participant.grandTotal)}</span>
                </p>
              </div>
            </article>
          ))}
        </section>
        <aside className="h-fit space-y-5 xl:sticky xl:top-24">
          <MemberLookup associatedMemberId={associatedMemberId} />
          {associatedMemberIds.length !== 1 && <p className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">This payment has mixed member/guest orders, so no loyalty points will be awarded.</p>}
          <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-[0_14px_34px_rgb(15,23,42,0.07)]">
            <p className="eyebrow">Payment</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900">Complete table payment</h2>
            <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-400">Overall table total</p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight text-orange-600">{formatCurrency(previewGrandTotal)}</p>
            <DiscountControl disabled={isCompleting} discount={discount} error={discountPreview.error} onChange={setDiscount} preview={discountPreview.value} />
            <div className="mt-6">
              <p className="text-sm font-bold text-slate-800">Payment method</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {paymentMethods.map((method) => (
                  <button aria-pressed={paymentMethod === method} className={`rounded-xl px-3 py-3 text-left text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-orange-300 ${paymentMethod === method ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'bg-slate-50 text-slate-600 hover:bg-orange-50 hover:text-orange-700'}`} disabled={isCompleting} key={method} onClick={() => setPaymentMethod(method)} type="button">
                    {method}
                  </button>
                ))}
              </div>
            </div>
            {paymentError && <p className="mt-5 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{paymentError}</p>}
            <Button className="mt-6 w-full py-3" disabled={Boolean(discountPreview.error)} onClick={() => setIsConfirming(true)}>
              Complete payment
            </Button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-400">This marks all unpaid served orders at Table {selectedTable.tableNumber} as paid.</p>
          </section>
        </aside>
      </div>
      {isConfirming && (
        <PaymentConfirmationDialog
          isLoading={isCompleting}
          method={paymentMethod}
          onCancel={() => {
            if (!isCompleting) setIsConfirming(false)
          }}
          onConfirm={completePayment}
          total={previewGrandTotal}
        />
      )}
    </div>
  )
}

export default CashierDashboard
