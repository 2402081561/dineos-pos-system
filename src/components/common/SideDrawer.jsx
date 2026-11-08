import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'

export default function SideDrawer({ title, onClose, busy = false, children, backLabel, onBack }) {
  const { t } = useCustomerLanguage()
  const ref = useRef(null)
  const timer = useRef(null)
  const [closing, setClosing] = useState(false)
  const titleId = useId()
  const close = useCallback(() => {
    if (busy || timer.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onClose(); return }
    setClosing(true)
    timer.current = setTimeout(onClose, 240)
  }, [busy, onClose])
  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      clearTimeout(timer.current)
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus?.()
    }
  }, [])
  function keyDown(event) {
    if (event.key === 'Escape') { event.stopPropagation(); close() }
    if (event.key !== 'Tab') return
    const nodes = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary')].filter((node) => node.getClientRects().length)
    const first = nodes[0], last = nodes.at(-1)
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  return createPortal(<div className="fixed inset-0 z-[60] flex justify-end" onKeyDown={keyDown}>
    <div className={`admin-details-backdrop absolute inset-0 bg-slate-950/45 ${closing ? 'is-closing' : ''}`} onClick={close} />
    <section ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`cashier-order-sheet relative flex h-[100dvh] w-full max-w-lg flex-col bg-white shadow-2xl outline-none ${closing ? 'is-closing' : ''}`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
        <div className="min-w-0">{onBack && <button type="button" disabled={busy} onClick={onBack} className="mb-2 rounded text-xs font-semibold text-orange-700 disabled:opacity-40">← {backLabel || t('Order details')}</button>}<h2 id={titleId} className="break-words text-lg font-bold text-slate-900">{title}</h2></div>
        <button type="button" disabled={busy} onClick={close} aria-label={t('Close order details')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-40">×</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">{children}</div>
    </section>
  </div>, document.body)
}
