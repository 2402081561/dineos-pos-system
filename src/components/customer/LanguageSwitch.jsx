import useCustomerLanguage from '../../hooks/useCustomerLanguage'

function LanguageSwitch() {
  const { language, setLanguage, t } = useCustomerLanguage()
  return <div aria-label={t('Language')} className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group">
    {[{ value: 'zh', label: '中文' }, { value: 'en', label: 'EN' }].map(({ value, label }) => <button aria-pressed={language === value} className={`min-h-9 rounded-md px-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 sm:px-3 ${language === value ? 'bg-orange-600 text-white' : 'text-slate-600 hover:bg-white'}`} key={value} lang={value} onClick={() => setLanguage(value)} type="button">{label}</button>)}
  </div>
}

export default LanguageSwitch
