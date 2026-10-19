import { Link } from 'react-router-dom'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'

export default function CustomerCartShortcut({ itemCount, aboveOrderBar = false }) {
  const { t } = useCustomerLanguage()
  const count = Math.max(0, Math.trunc(Number(itemCount) || 0))
  return <Link
    aria-label={count ? t('View cart, {{count}} items', { count }) : t('View cart')}
    className={`fixed right-4 z-30 inline-flex min-h-14 items-center gap-2 rounded-full border border-white/80 bg-orange-600 px-4 py-3 text-sm font-bold text-white shadow-[0_6px_24px_rgb(234,88,12,0.3)] transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-300 sm:right-6 ${aboveOrderBar ? 'bottom-[calc(7rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(1.25rem+env(safe-area-inset-bottom))]'}`}
    data-customer-cart-shortcut
    to="/cart"
  >
    <svg aria-hidden="true" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 3h2l3 12h11l3-9H5" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg>
    <span>{t('View cart')}</span>
    <span aria-hidden="true" className="flex min-h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs text-orange-700">{count}</span>
  </Link>
}
