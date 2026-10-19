import useCustomerLanguage from '../../hooks/useCustomerLanguage'

// Unavailable is a final item state, not a loading button: keep its label at
// full contrast instead of inheriting the generic disabled-button opacity.
export default function SoldOutButton({ className = '' }) {
  const { t } = useCustomerLanguage()
  return <button className={`inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-800 px-3 py-3 text-sm font-extrabold text-white ${className}`} disabled type="button">
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></svg>
    {t('Sold out')}
  </button>
}
