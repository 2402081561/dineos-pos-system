import { useId } from 'react'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'

export default function OrderTypeSelector({ value, onChange, disabled = false, compact = false }) {
  const { t: uiText } = useCustomerLanguage()

  const { t } = useCustomerLanguage()
  const name = useId()
  return <fieldset className="mt-4 min-w-0" disabled={disabled}>
    <legend className="mb-2 text-sm font-bold text-slate-800">{t('Order type')}</legend>
    <div className="grid grid-cols-2 gap-2">
      {[['dine_in', 'Dine in'], ['take_away', 'Take away']].map(([type, label]) => <label key={type} className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 py-3 text-sm font-bold transition focus-within:ring-2 focus-within:ring-orange-400 ${value === type ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-slate-200 bg-white text-slate-600'} ${disabled ? 'cursor-wait opacity-60' : ''}`}>
        <input type="radio" className="h-4 w-4 accent-orange-600" name={name} value={type} checked={value === type} onChange={() => onChange(type)} />{t(label)}
      </label>)}
    </div>
    {!compact && <p className="mt-2 text-xs leading-5 text-slate-500">{t(value === 'take_away' ? uiText("This item will be packed for take away.") : uiText("Served at your table."))}</p>}
  </fieldset>
}
