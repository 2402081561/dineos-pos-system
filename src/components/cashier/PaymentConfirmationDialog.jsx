import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { createPortal } from 'react-dom'
import Button from '../common/Button'
import { formatCurrency } from '../../utils/currency'
import OptionSummary from '../common/OptionSummary'

function PaymentConfirmationDialog({ cashReceived, changeAmount, error, isLoading, items = [], method, onCancel, onConfirm, total, canRetry = false }) {
  const { t: uiText } = useCustomerLanguage()

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
      <section aria-labelledby="payment-confirmation-title" aria-modal="true" className="max-h-[90dvh] w-full max-w-md overflow-y-auto animate-[page-enter_180ms_ease-out] rounded-3xl bg-white p-6 shadow-2xl sm:p-7" role="dialog">
        <p className="eyebrow">{uiText("Payment confirmation")}</p>
        <h2 className="mt-1 text-2xl font-extrabold text-slate-900" id="payment-confirmation-title">{uiText("Confirm payment?")}</h2>
        {items.length > 0 && <section className="mt-4" aria-label={uiText('Items in this payment')}><h3 className="text-sm font-bold text-slate-700">{uiText('Items in this payment')}</h3><ul className="mt-2 max-h-[30dvh] divide-y divide-slate-100 overflow-y-auto overscroll-contain">{items.map((item) => <li className="flex justify-between gap-3 py-2 text-sm" key={item.id}><div className="min-w-0"><p className="font-semibold">{item.quantity}× {item.name}</p><OptionSummary item={item} />{item.notes && <p className="text-xs text-slate-500">{item.notes}</p>}</div><span className="shrink-0 tabular-nums">{formatCurrency(Number(item.price) * item.quantity)}</span></li>)}</ul></section>}
        <div className="mt-6 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{uiText("Payment method")}</p><p className="mt-1 font-bold text-slate-800">{uiText(method)}</p><p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-400">{uiText("Grand total")}</p><p className="mt-1 text-3xl font-extrabold text-orange-600">{formatCurrency(total)}</p></div>
        <p className="mt-4 text-sm leading-6 text-slate-500">{uiText("This pays only the selected items and quantities. Remaining food stays unpaid; serving and collection do not change.")}</p>
        {method === 'Cash' && <div className="mt-4 space-y-2 rounded-xl bg-emerald-50 p-4"><p className="flex justify-between text-sm text-slate-700"><span>{uiText("Cash received")}</span><span>{formatCurrency(cashReceived)}</span></p><p className="flex justify-between text-lg font-extrabold text-emerald-800"><span>{uiText("Change")}</span><span>{formatCurrency(changeAmount)}</span></p></div>}
        {error && <p className="mt-4 text-sm font-semibold text-red-700" role="alert">{uiText(error)}</p>}
        {canRetry && <p className="mt-3 text-sm text-slate-600">{uiText("The response was interrupted. Retry the same payment safely; it will not charge these items twice. You can also check receipt history.")}</p>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button disabled={isLoading} onClick={onCancel} variant="outline">{uiText("Cancel")}</Button><Button disabled={isLoading || (Boolean(error) && !canRetry)} onClick={onConfirm}>{isLoading ? uiText("Completing payment...") : canRetry ? uiText("Retry same payment") : uiText("Confirm payment")}</Button></div>
      </section>
    </div>,
    document.body,
  )
}

export default PaymentConfirmationDialog
