import { orderLocationLabel } from '../../utils/orderLocation'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useMemo, useRef, useState } from 'react'
import Button from '../../components/common/Button'
import ConfirmationDialog from '../../components/common/ConfirmationDialog'
import StatePanel from '../../components/common/StatePanel'
import PaymentConfirmationDialog from '../../components/cashier/PaymentConfirmationDialog'
import CashReceivedControl from '../../components/cashier/CashReceivedControl'
import PaymentSuccessPanel from '../../components/cashier/PaymentSuccessPanel'
import PaymentRecoveryPanel from '../../components/cashier/PaymentRecoveryPanel'
import usePaymentRecovery from '../../hooks/usePaymentRecovery'
import CashierOverview from '../../components/cashier/CashierOverview'
import DiscountControl from '../../components/cashier/DiscountControl'
import useAdminAuth from '../../hooks/useAdminAuth'
import MemberLookup from '../../components/cashier/MemberLookup'
import RewardRedemption from '../../components/cashier/RewardRedemption'
import useCashierTables from '../../hooks/useCashierTables'
import { calculateTableDiscount } from '../../services/orderService'
import { clearSupabaseCashierTable, completeSupabaseTablePayment } from '../../services/adminApiService'
import { formatCurrency } from '../../utils/currency'
import { getCashPayment } from '../../utils/cashPayment'
import { paymentPlan, selectPaymentOrders } from '../../../server/src/paymentSelection'
import OptionSummary from '../../components/common/OptionSummary'
import { allUnpaidQuantities, billSelections, tableForPayment } from '../../utils/splitBill'

const paymentMethods = ['Cash', 'Credit/Debit Card', "Touch 'n Go", 'GrabPay', 'FPX', 'Other']
const clearKey = (table) => `${table.tableId}:${table.tableSessionId ?? ''}`


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
  const { t: uiText } = useCustomerLanguage()

  const { authUser: user } = useAdminAuth()
  const recovery = usePaymentRecovery(user?.id)
  const { clearableTables, error, floorTables, floorPlan, setFloorPlan, isLoading, setFloorTables, tables, summary, recentOrders, billRequests, refreshPayments } = useCashierTables()
  const [selectedTableNumber, setSelectedTableNumber] = useState('')
  const [quantities, setQuantities] = useState({})
  const [splitPayment, setSplitPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [discount, setDiscount] = useState({ type: 'percentage', value: '0' })
  const [storedPaymentConfirmation, setPaymentConfirmation] = useState(null)
  const paymentConfirmation = storedPaymentConfirmation?.actorId === user?.id ? storedPaymentConfirmation : null
  const [cashReceived, setCashReceived] = useState('')
  const paymentInFlight = useRef(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [canRetryPayment, setCanRetryPayment] = useState(false)
  const [storedPaymentSuccess, setPaymentSuccess] = useState(null)
  const paymentSuccess = storedPaymentSuccess?.actorId === user?.id ? storedPaymentSuccess : null
  const [lookupMember, setLookupMember] = useState(null)
  const [clearingTable, setClearingTable] = useState(null)
  const [clearedTableIds, setClearedTableIds] = useState([])
  const [isClearing, setIsClearing] = useState(false)
  const [clearError, setClearError] = useState('')

  const selectedTable = tables.find((table) => (table.billKey ?? table.tableNumber) === selectedTableNumber) ?? paymentConfirmation?.tableSnapshot
  const selections = useMemo(() => billSelections(selectedTable?.orders ?? [], quantities, splitPayment), [selectedTable?.orders, quantities, splitPayment])
  const selectedOrders = useMemo(() => { try { return selectPaymentOrders(selectedTable?.orders ?? [], selections) } catch { return [] } }, [selectedTable?.orders, selections])
  const associatedMemberIds = useMemo(
    () => [
      ...new Set(
        selectedOrders.map((order) =>
          String(order.memberId ?? '')
            .trim()
            .toUpperCase(),
        ),
      ),
    ],
    [selectedOrders],
  )
  const associatedMemberId = associatedMemberIds.length === 1 && associatedMemberIds[0] ? associatedMemberIds[0] : ''
  const billParticipants = useMemo(() => groupParticipants(selectedTable?.orders ?? []), [selectedTable?.orders])
  const tableSubtotal = useMemo(() => selectedOrders.reduce((sum, order) => sum + order.subtotal, 0), [selectedOrders])
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
    try { return paymentPlan(selectedTable?.orders ?? [], selections, discountPreview.value?.amount ?? 0).grandTotal }
    catch { return null }
  }, [discountPreview.value?.amount, selectedTable?.orders, selections])
  const cashPayment = getCashPayment(previewGrandTotal, cashReceived)
  const paymentLocked = isCompleting || Boolean(paymentConfirmation)
  const currentOrderIds = (selectedTable?.orders ?? []).map((order) => order.id).sort().join(',')
  const confirmationChanged = Boolean(paymentConfirmation && (paymentConfirmation.orderIds.join(',') !== currentOrderIds || paymentConfirmation.expectedAmount !== previewGrandTotal || selectedTable?.orders.some((order) => order.version !== paymentConfirmation.versions[order.id])))
  const tablesReadyToClear = clearableTables.filter((table) => !clearedTableIds.includes(clearKey(table)))
  const remainingTable = tableForPayment(tables, paymentSuccess)
  const remainingAmount = paymentSuccess?.tableSessionId && paymentSuccess.balanceStatus === 'ready' && !error ? Number(remainingTable?.grandTotal ?? 0) : null

  function openTable(table, options = {}) {
    setQuantities({})
    setSplitPayment(options.split === true)
    setSelectedTableNumber(table.billKey ?? table.tableNumber)
    setPaymentError('')
    setPaymentSuccess(null)
    setDiscount(options.discount ? { type: options.discount.type, value: String(options.discount.value) } : { type: 'percentage', value: '0' })
    setCashReceived('')
    setPaymentMethod('Cash')
    setPaymentConfirmation(null)
  }

  function confirmPayment() {
    if (error || paymentLocked || !selectedTable || discountPreview.error || previewGrandTotal === null || (paymentMethod === 'Cash' && cashPayment.error)) return
    setPaymentError('')
    setCanRetryPayment(false)
    setPaymentConfirmation({
      actorId: user?.id,
      tableSnapshot: selectedTable,
      requestId: crypto.randomUUID(),
      selections,
      items: selectedOrders.flatMap((order) => order.items.map((item) => ({ ...item, orderType: item.orderType ?? order.orderType }))),
      versions: Object.fromEntries(selectedTable.orders.map((order) => [order.id, order.version])),
      orderIds: selectedTable.orders.map((order) => order.id).sort(),
      discount: { ...discount },
      paymentMethod,
      expectedAmount: previewGrandTotal,
      ...(paymentMethod === 'Cash' ? { cashReceived: cashPayment.cashReceived, changeAmount: cashPayment.change } : {}),
    })
  }

  async function completePayment() {
    if (!selectedTable || !user?.id || !paymentConfirmation || paymentInFlight.current) return
    if ((discountPreview.error || confirmationChanged) && !canRetryPayment) {
      setPaymentError(discountPreview.error || 'The bill has changed. Review it and confirm payment again.')
      setPaymentConfirmation(null)
      return
    }
    paymentInFlight.current = true
    try {
      setIsCompleting(true)
      setPaymentError('')
      const body = recovery.start(paymentConfirmation, selectedTableNumber)
      const paymentResult = await completeSupabaseTablePayment(body)
      if (!recovery.isCurrent()) return
      if (!paymentResult?.receiptNumber || !paymentResult.paidAt) throw new Error('Could not confirm payment. Keep this page and try again.')
      resolvePayment(paymentResult, paymentConfirmation.paymentMethod)
    } catch (firebaseError) {
      console.error('[Cashier] Failed to complete payment:', firebaseError)
      if (!recovery.isCurrent()) return
      setPaymentError(firebaseError.message || 'We could not complete this payment. Please try again.')
      // Only this first, definitively rejected attempt can be unlocked. Once a
      // response is uncertain the recovery panel keeps the original key forever.
      if ([400, 409, 422].includes(firebaseError.status)) recovery.clear()
      setCanRetryPayment(!firebaseError.status || firebaseError.status >= 500)
    } finally {
      paymentInFlight.current = false
      setIsCompleting(false)
    }
  }

  function resolvePayment(paymentResult, method = paymentResult.paymentMethod) {
      if (!recovery.isCurrent()) return
      // If storage cannot be cleared, keep recovery visible instead of allowing
      // a fresh collection in this tab. Rechecking remains read-only and safe.
      recovery.clear()
      setSelectedTableNumber(String(paymentResult.tableNumber ?? recovery.pending?.tableNumber ?? selectedTableNumber))
      setPaymentSuccess({
        actorId: user?.id,
        tableId: paymentResult.tableId,
        isWalkIn: paymentResult.isWalkIn === true,
        tableSessionId: paymentResult.tableSessionId,
        method,
        paidTime: paymentResult.paidAt,
        receiptNumber: paymentResult.receiptNumber,
        total: paymentResult.amount,
        loyalty: paymentResult.loyalty,
        cashReceived: paymentResult.cashReceived,
        changeAmount: paymentResult.changeAmount,
        balanceStatus: 'checking',
      })
      setPaymentConfirmation(null)
      void refreshPaymentBalance(paymentResult.receiptNumber)
  }

  async function refreshPaymentBalance(receiptNumber) {
    const update = (balanceStatus) => {
      if (!recovery.isCurrent()) return
      setPaymentSuccess((current) => current?.actorId === user?.id && current.receiptNumber === receiptNumber ? { ...current, balanceStatus } : current)
    }
    update('checking')
    try { await refreshPayments(); update('ready') }
    catch { update('error') }
  }

  async function clearTable() {
    if (!clearingTable?.tableId) return
    try {
      setIsClearing(true)
      setClearError('')
      await clearSupabaseCashierTable(clearingTable.tableId, clearingTable.tableSessionId)
      setClearedTableIds((current) => [...new Set([...current, clearKey(clearingTable)])])
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
      description={uiText("Clear Table {{v0}}? Confirm the customer is finished. This ends the visit and makes the table available again. Orders and receipts remain saved.", { v0: clearingTable.tableNumber })}
      isLoading={isClearing}
      onCancel={() => {
        if (!isClearing) setClearingTable(null)
      }}
      onConfirm={clearTable}
      title={uiText("Clear Table {{v0}}?", { v0: clearingTable.tableNumber })}
    />
  ) : null

  if (recovery.pending) return <PaymentRecoveryPanel key={`${user?.id}:${recovery.pending.body?.requestId ?? 'damaged'}`} pending={recovery.pending} busy={isCompleting} onResolved={resolvePayment} />

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
  if (error && !paymentConfirmation && floorTables.length === 0 && tables.length === 0) return <StatePanel description={uiText(error)} title={uiText("Cashier queue unavailable")} tone="error" />

  if (!selectedTableNumber || (!selectedTable && !paymentSuccess)) {
    return (
      <div className="space-y-4">
        <header className="flex items-center justify-between gap-3"><h1 className="text-lg font-bold text-slate-900">{uiText("Cashier")}</h1><span className="inline-flex items-center gap-2 text-xs text-slate-500"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{uiText("Updates automatically")}</span></header>
        <CashierOverview
          assignmentActorId={user?.id}
          refreshPayments={refreshPayments}
          error={error}
          isLoading={isLoading}
          billRequests={billRequests}
          summary={summary}
          recentOrders={recentOrders}
          clearableTables={tablesReadyToClear}
          floorTables={floorTables}
          floorPlan={floorPlan}
          onClearTable={(table) => {
            setClearError('')
            setClearingTable(table)
          }}
          onLayoutSaved={(positions, savedPlan) => {
            if (savedPlan) setFloorPlan(savedPlan)
            const byId = new Map(positions.map((position) => [position.tableId, position]))
            setFloorTables((current) => current.map((table) => {
              const position = byId.get(table.id)
              return position ? { ...table, floorX: position.x, floorY: position.y, floorZone: position.zone, floorStyle: position.style, floorPoint: position.point } : table
            }))
          }}
          onOpenTable={openTable}
          paymentTables={tables}
        >
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
        </CashierOverview>
        {clearError && (
          <p aria-live="polite" className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
            {uiText(clearError)}
          </p>
        )}
        {clearTableDialog}
      </div>
    )
  }

  if (paymentSuccess)
    return (
      <div>
        <PaymentSuccessPanel payment={paymentSuccess} tableNumber={selectedTableNumber} remainingAmount={remainingAmount} balanceError={!paymentSuccess.tableSessionId || paymentSuccess.balanceStatus === 'error' || Boolean(error)} onRefreshBalance={() => void refreshPaymentBalance(paymentSuccess.receiptNumber)} onContinue={() => {
          if (remainingAmount > 0 && remainingTable && !error) openTable(remainingTable, { split: true })
        }} canClear={remainingAmount === 0 && Boolean(paymentSuccess.tableSessionId) && tablesReadyToClear.some((table) => clearKey(table) === clearKey(paymentSuccess))} cleared={clearedTableIds.includes(clearKey(paymentSuccess))} isClearing={isClearing} error={uiText(clearError)} onBack={() => { setPaymentSuccess(null); setSelectedTableNumber('') }} onClear={() => {
          setClearError('')
          if (paymentSuccess.tableSessionId && tablesReadyToClear.some((table) => clearKey(table) === clearKey(paymentSuccess))) setClearingTable({ tableId: paymentSuccess.tableId, tableSessionId: paymentSuccess.tableSessionId, tableNumber: selectedTableNumber })
        }} />
        {clearTableDialog}
      </div>
    )

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{orderLocationLabel(selectedTable, uiText)}{' '}{uiText("· Payment")}</h1>
          <Button disabled={paymentLocked} onClick={() => setSelectedTableNumber('')} variant="outline">{uiText("← Tables")}</Button>
      </header>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">{uiText("Unpaid items")}</h2><div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label={uiText("Payment scope")}>{[[false, 'Whole table'], [true, 'Split bill']].map(([split, label]) => <button key={label} type="button" disabled={paymentLocked} aria-pressed={splitPayment === split} onClick={() => { setSplitPayment(split); setQuantities({}) }} className={`rounded-md px-3 py-2 text-sm font-semibold ${splitPayment === split ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-600'}`}>{uiText(label)}</button>)}</div></div>
            {splitPayment && <><p className="text-sm text-slate-500">{uiText("Choose quantities to pay now. Remaining items stay unpaid.")}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={paymentLocked} onClick={() => setQuantities(allUnpaidQuantities(selectedTable.orders))}>{uiText("Select all")}</Button><Button variant="outline" disabled={paymentLocked} onClick={() => setQuantities({})}>{uiText("Clear selection")}</Button></div></>}
            {selectedTable.orders.flatMap((order) => order.items.map((item) => ({ ...item, orderNumber: order.orderNumber }))).filter((item) => item.quantity > (item.paidQuantity ?? 0)).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t border-slate-100 py-3"><span className="min-w-0"><strong className="block text-sm">{item.quantity - (item.paidQuantity ?? 0)}× {item.name}</strong><OptionSummary item={item} />{item.notes && <span className="block text-xs text-slate-500">{item.notes}</span>}<span className="mt-1 block text-xs text-slate-500">{item.orderNumber} · {formatCurrency(item.price)}{' '}{uiText("each")}</span></span>{splitPayment ? <input aria-label={uiText("Pay quantity: {{v0}}", { v0: item.name })} className="w-20 rounded-lg border p-2" type="number" min="0" max={item.quantity - (item.paidQuantity ?? 0)} step="1" disabled={paymentLocked} value={quantities[item.id] ?? 0} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))} /> : <strong className="whitespace-nowrap text-sm">{formatCurrency(Number(item.price) * (item.quantity - (item.paidQuantity ?? 0)))}</strong>}</div>)}
          </div>
          <details className="space-y-3"><summary className="cursor-pointer rounded-xl border bg-white p-4 font-bold">{uiText("All remaining table items / charge breakdown")}</summary>
          {billParticipants.map((participant, participantIndex) => (
            <article className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm" key={`${participant.customerNickname}-${participantIndex}`}>
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{uiText("Participant")}</p>
                  <h2 className="mt-1 text-lg font-extrabold text-slate-900">{participant.customerNickname}</h2>
                </div>
                <span className="font-extrabold text-orange-600">{formatCurrency(participant.grandTotal)}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {participant.orders
                  .flatMap((order) => (order.items ?? []).map((item) => ({ ...item, quantity: item.quantity - (item.paidQuantity ?? 0), orderType: item.orderType ?? order.orderType ?? 'dine_in' }))).filter((item) => item.quantity > 0)
                  .map((item, index) => (
                    <div className="flex items-start justify-between gap-4 p-4" key={`${item.menuItemId}-${index}`}>
                      <div>
                        <p className="font-semibold text-slate-800">
                          {item.quantity}× {item.name}
                        </p>
                        <OptionSummary item={item} />{item.notes && <p className="mt-1 text-xs text-slate-500">{uiText("Note:")}{' '}{item.notes}</p>}
                      </div>
                      <p className="whitespace-nowrap font-bold text-slate-700">{formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 0))}</p>
                    </div>
                  ))}
              </div>
              <div className="grid gap-2 border-t border-slate-100 bg-slate-50 p-5 text-sm">
                <p className="flex justify-between text-slate-600">
                  <span>{uiText("Subtotal")}</span>
                  <span>{formatCurrency(participant.subtotal)}</span>
                </p>
                <p className="flex justify-between text-slate-600">
                  <span>{uiText("Service charge")}</span>
                  <span>{formatCurrency(participant.serviceCharge)}</span>
                </p>
                <p className="flex justify-between text-slate-600">
                  <span>{uiText("SST")}</span>
                  <span>{formatCurrency(participant.sst)}</span>
                </p>
                <p className="mt-1 flex justify-between border-t border-slate-200 pt-3 font-bold text-slate-900">
                  <span>{uiText("Grand total")}</span>
                  <span className="text-orange-600">{formatCurrency(participant.grandTotal)}</span>
                </p>
              </div>
            </article>
          ))}
          </details>
        </section>
        <aside className="h-fit space-y-5 xl:sticky xl:top-24">
          <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-bold">{uiText("Member / loyalty")}{' '}{associatedMemberId && <span className="font-normal text-slate-500">· {associatedMemberId}</span>}</summary><div className="mt-3"><MemberLookup associatedMemberId={associatedMemberId} /></div></details>
          {associatedMemberIds.length > 1 && <p className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">{uiText("This payment has mixed member/guest orders, so no loyalty points will be awarded.")}</p>}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-500">{uiText("Amount to collect")}</p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight text-orange-600">{formatCurrency(previewGrandTotal ?? 0)}</p>
            {splitPayment && selections.length === 0 && <p className="mt-2 text-sm text-slate-500">{uiText('Select the dishes this diner is paying for.')}</p>}
            <details className="mt-4 border-y border-slate-100 py-3"><summary className="cursor-pointer text-sm font-semibold">{uiText("Discount")}{' '}{discountPreview.value?.amount > 0 && <span className="text-orange-600">−{formatCurrency(discountPreview.value.amount)}</span>}</summary><DiscountControl disabled={paymentLocked} discount={discount} error={discountPreview.error} onChange={setDiscount} preview={discountPreview.value} /></details>
            {discountPreview.error && <p role="alert" className="mt-2 text-sm text-red-700">{uiText(discountPreview.error)}</p>}
            <div className="mt-6">
              <p className="text-sm font-bold text-slate-800">{uiText("Payment method")}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {paymentMethods.map((method) => (
                  <button aria-pressed={paymentMethod === method} className={`rounded-lg border px-3 py-3 text-left text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-orange-300 ${paymentMethod === method ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`} disabled={paymentLocked} key={method} onClick={() => { setPaymentMethod(method); setCashReceived(''); setPaymentError('') }} type="button">
                    {uiText(method)}
                  </button>
                ))}
              </div>
            </div>
            {paymentMethod === 'Cash' && <CashReceivedControl disabled={paymentLocked} onChange={setCashReceived} payment={cashPayment} total={previewGrandTotal} value={cashReceived} />}
            {paymentError && <p className="mt-5 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{uiText(paymentError)}</p>}
            <Button className="mt-6 w-full py-3" disabled={Boolean(error) || paymentLocked || Boolean(discountPreview.error) || previewGrandTotal === null || (paymentMethod === 'Cash' && Boolean(cashPayment.error))} onClick={confirmPayment}>{uiText("Complete payment")}</Button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-400">{uiText("Only the selected quantities are paid. This does not mark food as served or collected.")}</p>
          </section>
        </aside>
      </div>
      {paymentConfirmation && (
        <PaymentConfirmationDialog
          canRetry={canRetryPayment}
          cashReceived={paymentConfirmation.cashReceived}
          changeAmount={paymentConfirmation.changeAmount}
          error={paymentError || (confirmationChanged ? 'The bill has changed. Cancel and review the updated bill.' : '')}
          isLoading={isCompleting}
          items={paymentConfirmation.items}
          method={paymentConfirmation.paymentMethod}
          onCancel={() => {
            if (!isCompleting) setPaymentConfirmation(null)
          }}
          onConfirm={completePayment}
          total={paymentConfirmation.expectedAmount}
        />
      )}
    </div>
  )
}

export default CashierDashboard
