import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button'

export default function PosDialog({ title, onClose, busy = false, children }) {
  const { t: uiText } = useCustomerLanguage()

  const ref = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus?.() }
  }, [])
  function keyDown(event) {
    if (event.key === 'Escape' && !busy) onClose()
    if (event.key !== 'Tab') return
    const nodes = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]')]
    const first = nodes[0], last = nodes.at(-1)
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  return createPortal(<div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/50 p-3 sm:p-6">
    <section ref={ref} tabIndex={-1} aria-labelledby={titleId} aria-modal="true" role="dialog" onKeyDown={keyDown} className="mx-auto my-3 max-w-3xl rounded-2xl bg-white shadow-xl outline-none">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b bg-white p-4"><h2 id={titleId} className="text-lg font-bold">{uiText(title)}</h2><Button disabled={busy} variant="outline" onClick={onClose}>{uiText("Close")}</Button></header>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  </div>, document.body)
}
