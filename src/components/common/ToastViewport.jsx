import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import useToast from '../../hooks/useToast'

function ToastViewport() {
  const { t: uiText } = useCustomerLanguage()

  const { toast, dismissToast } = useToast()

  if (!toast) return null

  const toneClasses = toast.tone === 'error'
    ? 'border-red-100 bg-red-50 text-red-800'
    : 'border-emerald-100 bg-emerald-50 text-emerald-800'

  function handleAction() {
    dismissToast()
    toast.action?.onClick?.()
  }

  return <div aria-live="polite" className="fixed inset-x-4 top-5 z-50 flex justify-center sm:left-auto sm:right-5 sm:top-5"><div className={`flex max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl shadow-slate-900/10 transition-all duration-200 ${toneClasses}`} role="status"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70 text-xs font-bold">{toast.tone === 'error' ? '!' : '✓'}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{uiText(toast.message)}</p>{toast.detail && <p className="mt-0.5 text-xs opacity-80">{uiText(toast.detail)}</p>}{toast.action && <button className="mt-2 text-xs font-bold underline underline-offset-2 transition hover:opacity-70" onClick={handleAction} type="button">{uiText(toast.action.label)}</button>}</div><button aria-label={uiText(toast.dismissLabel || 'Dismiss notification')} className="ml-1 rounded-md text-base leading-none opacity-60 transition hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current" onClick={dismissToast} type="button">×</button></div></div>
}

export default ToastViewport
