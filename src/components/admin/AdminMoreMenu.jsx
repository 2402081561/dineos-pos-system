import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router-dom'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'

// Mount outside the blurred/fixed bottom-nav containing block, especially on iOS.
export default function AdminMoreMenu({ items, onClose, id }) {
  const { t, language } = useCustomerLanguage()
  const panel = useRef(null)
  const timer = useRef(null)
  const closing = useRef(false)
  const [isClosing, setClosing] = useState(false)
  const titleId = useId()
  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { onClose(); return }
    setClosing(true)
    timer.current = setTimeout(onClose, 180)
  }, [onClose])

  useLayoutEffect(() => {
    const previous = document.activeElement
    const body = document.body
    const saved = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width }
    const top = window.scrollY
    const app = document.getElementById('root')
    const inert = app?.inert
    Object.assign(body.style, { overflow: 'hidden', position: 'fixed', top: `-${top}px`, width: '100%' })
    if (app) app.inert = true
    panel.current?.focus({ preventScroll: true })
    const desktop = window.matchMedia?.('(min-width: 1024px)')
    const onResize = () => { if (desktop?.matches) onClose() }
    desktop?.addEventListener?.('change', onResize)
    onResize()
    return () => {
      clearTimeout(timer.current)
      desktop?.removeEventListener?.('change', onResize)
      Object.assign(body.style, saved)
      if (app) app.inert = inert
      window.scrollTo({ top, behavior: 'instant' })
      if (previous?.isConnected) previous.focus?.({ preventScroll: true })
    }
  }, [onClose])

  function keyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key !== 'Tab' || !panel.current) return
    const nodes = [...panel.current.querySelectorAll('button:not(:disabled), a[href]')].filter(node => node.getClientRects().length)
    const first = nodes[0], last = nodes.at(-1)
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus() }
  }

  return createPortal(<div className={`admin-more-overlay fixed inset-0 z-[80] flex items-end justify-center px-3 pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${isClosing ? 'is-closing' : ''}`} onKeyDown={keyDown}>
    <div aria-hidden="true" className="admin-more-backdrop absolute inset-0" onClick={close} />
    <section id={id} ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="admin-more-sheet relative flex max-h-[80dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 id={titleId} className="text-lg font-bold text-slate-900">{language === 'zh' ? '更多功能' : 'More'}</h2>
        <button type="button" onClick={close} aria-label={t('Close')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-orange-500">×</button>
      </header>
      <div className="grid min-h-0 grid-cols-2 gap-2 overflow-y-auto overscroll-contain p-4">{items.map(item => <NavLink key={item.to} to={item.to} onClick={onClose} className={({ isActive }) => `flex min-h-12 min-w-0 items-center break-words rounded-xl border p-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-orange-500 ${isActive ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-slate-100 bg-slate-50 text-slate-700 hover:bg-orange-50'}`}>{t(item.label)}</NavLink>)}</div>
    </section>
  </div>, document.body)
}
