import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import Button from './Button'

function StatePanel({ title, description, tone = 'neutral', onRetry }) {
  const { t: uiText } = useCustomerLanguage()

  const { t } = useCustomerLanguage()
  const isError = tone === 'error'
  const toneClass = isError ? 'border-red-100 bg-red-50 text-red-800' : 'border-slate-100 bg-white text-slate-600'
  const iconClass = isError ? 'bg-red-100 text-red-600' : 'bg-orange-50 text-orange-600'
  const retry = onRetry ?? (() => window.location.reload())

  return <div className={`rounded-2xl border p-8 text-center shadow-sm sm:p-10 ${toneClass}`}><span aria-hidden="true" className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-xl ${iconClass}`}>{isError ? '!' : '🍽'}</span><p className="mt-4 text-lg font-bold">{uiText(title)}</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 opacity-80">{uiText(description)}</p>{isError && <Button className="mt-5" onClick={retry} variant="outline">{t("Try again")}</Button>}</div>
}

export default StatePanel
