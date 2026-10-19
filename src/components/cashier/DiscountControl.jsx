import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { formatCurrency } from '../../utils/currency'

function DiscountControl({ disabled, discount, error, onChange, preview }) {
  const { t: uiText } = useCustomerLanguage()

  return <section className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-bold text-slate-800">{uiText("Discount")}</h3><span className="text-sm font-extrabold text-orange-600">-{formatCurrency(preview?.amount ?? 0)}</span></div><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px]"><label className="text-xs font-bold uppercase tracking-wide text-slate-500">{uiText("Type")}<select className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700" disabled={disabled} onChange={(event) => onChange({ ...discount, type: event.target.value })} value={discount.type}><option value="percentage">{uiText("Percentage")}</option><option value="fixed">{uiText("Fixed amount")}</option></select></label><label className="text-xs font-bold uppercase tracking-wide text-slate-500">{uiText("Value")}<input className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700" disabled={disabled} min="0" onChange={(event) => onChange({ ...discount, value: event.target.value })} step="0.01" type="number" value={discount.value} /></label></div><p className="mt-3 text-xs text-slate-500">{discount.type === 'percentage' ? uiText("Percentage is limited to 100%.") : uiText("Fixed amount cannot exceed the table subtotal.")}</p>{error && <p aria-live="polite" className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{uiText(error)}</p>}</section>
}

export default DiscountControl
