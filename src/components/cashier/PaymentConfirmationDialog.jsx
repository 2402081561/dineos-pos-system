import { createPortal } from 'react-dom'
import Button from '../common/Button'
import { formatCurrency } from '../../utils/currency'

function PaymentConfirmationDialog({ isLoading, method, onCancel, onConfirm, total }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
      <section aria-modal="true" className="w-full max-w-md animate-[page-enter_180ms_ease-out] rounded-3xl bg-white p-6 shadow-2xl sm:p-7" role="dialog">
        <p className="eyebrow">Payment confirmation</p>
        <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Confirm payment?</h2>
        <div className="mt-6 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Payment method</p><p className="mt-1 font-bold text-slate-800">{method}</p><p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-400">Grand total</p><p className="mt-1 text-3xl font-extrabold text-orange-600">{formatCurrency(total)}</p></div>
        <p className="mt-4 text-sm leading-6 text-slate-500">This will mark every unpaid served order at this table as paid.</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button disabled={isLoading} onClick={onCancel} variant="outline">Cancel</Button><Button disabled={isLoading} onClick={onConfirm}>{isLoading ? 'Completing payment...' : 'Confirm payment'}</Button></div>
      </section>
    </div>,
    document.body,
  )
}

export default PaymentConfirmationDialog
