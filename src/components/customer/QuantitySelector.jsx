import useCustomerLanguage from '../../hooks/useCustomerLanguage'
function QuantitySelector({ quantity, onDecrease, onIncrease, disabled = false }) {
  const { t } = useCustomerLanguage()
  return <div aria-label={t("Quantity selector")} className="flex items-center rounded-2xl bg-slate-100 p-1 shadow-inner shadow-slate-200/50"><button aria-label={t("Decrease quantity")} className="h-11 w-11 rounded-xl sm:h-9 sm:w-9 bg-white text-lg font-bold shadow-sm transition hover:bg-orange-50 hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled || quantity <= 1} onClick={onDecrease} type="button">−</button><span aria-live="polite" className="w-8 text-center sm:w-10 text-sm font-bold tabular-nums">{quantity}</span><button aria-label={t("Increase quantity")} className="h-11 w-11 rounded-xl sm:h-9 sm:w-9 bg-orange-600 text-lg font-bold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled} onClick={onIncrease} type="button">+</button></div>
}

export default QuantitySelector
