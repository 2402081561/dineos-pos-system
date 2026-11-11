import useCustomerLanguage from '../../hooks/useCustomerLanguage'

export default function PortalThemeToggle({ theme, onToggle }) {
  const { t } = useCustomerLanguage()
  const dark = theme === 'dark'
  return <button type="button" aria-label={t('Dark mode')} aria-pressed={dark} title={t(dark ? 'Switch to light mode' : 'Switch to dark mode')} onClick={onToggle} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      {dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></> : <path d="M20.8 13.1A8.7 8.7 0 0 1 10.9 3.2a8.8 8.8 0 1 0 9.9 9.9Z" />}
    </svg>
  </button>
}
