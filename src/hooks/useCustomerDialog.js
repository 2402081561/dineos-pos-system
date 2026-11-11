import { useLayoutEffect, useRef, useState } from 'react'

// Customer-only dialog lifecycle. The timer is an exit transition, never a
// data/loading delay. Keep scroll locked until the closing surface unmounts.
export default function useCustomerDialog(onClose, enabled = true) {
  const dialog = useRef(null)
  const timer = useRef(null)
  const closing = useRef(false)
  const [isClosing, setClosing] = useState(false)
  // Layout cleanup runs before a destination menu restores its own anchor.
  useLayoutEffect(() => {
    if (!enabled) return
    const previous = document.activeElement
    const body = document.body
    const saved = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width }
    const top = window.scrollY
    Object.assign(body.style, { overflow: 'hidden', position: 'fixed', top: `-${top}px`, width: '100%' })
    dialog.current?.querySelector('h2')?.focus({ preventScroll: true })
    return () => {
      clearTimeout(timer.current)
      Object.assign(body.style, saved)
      window.scrollTo({ top, behavior: 'instant' })
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [enabled])
  function close() {
    if (closing.current) return
    closing.current = true
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { onClose(); return }
    setClosing(true)
    timer.current = setTimeout(onClose, 180)
  }
  function keyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key !== 'Tab' || !dialog.current) return
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter(element => element.getClientRects().length)
    const first = controls[0], last = controls.at(-1)
    if (!controls.length) { event.preventDefault(); return }
    if (event.shiftKey && document.activeElement !== last && (document.activeElement === first || !controls.includes(document.activeElement))) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) { event.preventDefault(); first.focus() }
  }
  return { dialog, close, keyDown, isClosing }
}
