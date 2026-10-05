import Button from '../common/Button'
import { formatCurrency } from '../../utils/currency'

function CashReceivedControl({ disabled, onChange, payment, total, value }) {
  return (
    <div className="mt-5 rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
      <label className="text-sm font-bold text-slate-800" htmlFor="cash-received">Cash received (RM)</label>
      <input
        aria-describedby="cash-change"
        aria-invalid={Boolean(value.trim() && payment.error)}
        autoComplete="off"
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-xl font-bold text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:opacity-60"
        disabled={disabled}
        id="cash-received"
        inputMode="decimal"
        maxLength={16}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Enter amount received"
        type="text"
        value={value}
      />
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-3">
        {[5, 10, 20, 50, 100].map((amount) => <Button className="px-2" disabled={disabled} key={amount} onClick={() => onChange(amount.toFixed(2))} variant="secondary">RM{amount}</Button>)}
      </div>
      <Button className="mt-2 w-full" disabled={disabled || total === null} onClick={() => onChange(total.toFixed(2))} variant="outline">Exact amount</Button>
      <div aria-live="polite" className={`mt-3 rounded-xl p-3 text-center ${payment.error ? 'bg-white text-slate-600' : 'bg-emerald-100 text-emerald-800'}`} id="cash-change">
        {!value.trim() ? <p className="text-sm">Enter the customer's cash amount to calculate change.</p> : payment.error ? <p className="text-sm font-semibold">{payment.error}</p> : <p className="text-xl font-extrabold">Change: {formatCurrency(payment.change)}</p>}
      </div>
    </div>
  )
}

export default CashReceivedControl
