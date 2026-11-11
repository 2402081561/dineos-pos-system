import { useEffect, useRef, useState } from 'react'
import OrderIdentifiers from '../common/OrderIdentifiers'
import { hasSavedTableVisitTools } from '../../utils/deploymentFeatures'
import { createPortal } from 'react-dom'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { buildKitchenTicket } from '../../utils/kitchenTicket'
import { androidReceiptIntent, isAndroidPrintDevice } from '../../utils/androidReceiptPrint'
import KitchenTicketPaper from './KitchenTicketPaper'

export default function KitchenTicketDialog({ order, onClose }) {
  const { t } = useCustomerLanguage()
  const [identifiers,setIdentifiers]=useState({ticketSeat:'',ticketReference:'',canPrint:false})
  const [message, setMessage] = useState('')
  const dialogRef = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector('button')?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus?.() }
  }, [])
  let ticket
  try { ticket = buildKitchenTicket(order, { tableLabel:identifiers.ticketSeat, reference:identifiers.ticketReference, t }) } catch { /* Invalid snapshots cannot print. */ }
  const android = isAndroidPrintDevice(navigator.userAgent)
  const canPrint = Boolean(ticket && (order?.pickupCode || !hasSavedTableVisitTools || identifiers.canPrint))
  return createPortal(<div ref={dialogRef} onKeyDown={(event) => {
    if (event.key === 'Escape') onClose()
    if (event.key !== 'Tab') return
    const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), summary')].filter(control => control.getClientRects().length > 0)
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }} className="kitchen-print-overlay fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label={t('Kitchen ticket')}>
    <div className="flex max-h-[calc(100dvh-24px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="kitchen-print-controls flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div><h2 className="text-lg font-bold">{t('Kitchen ticket')}</h2><p className="mt-1 break-all text-xs text-slate-500">{t('Order')} · {order?.orderNumber ?? '—'}</p></div><button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100" type="button" onClick={onClose}>{t('Close')}</button>
      </div>
      <div className="kitchen-print-content min-h-0 overflow-y-auto overscroll-contain bg-slate-50 px-4 py-5 sm:px-6">
        {ticket && <KitchenTicketPaper ticket={ticket} label={t('Kitchen ticket preview')} />}
        <div className="kitchen-print-controls mt-5">
        {!order?.pickupCode && <details className="rounded-xl border border-slate-200 bg-white px-4 py-3"><summary className="cursor-pointer text-sm font-semibold">{t('Print labels (optional)')}</summary>
        {hasSavedTableVisitTools ? order&&<OrderIdentifiers key={order.id} orderId={order.id} onState={setIdentifiers}/> : <div className="mt-3 space-y-3">{['ticketSeat','ticketReference'].map((key)=><label className="block text-xs font-medium text-slate-600" key={key}>{t(key==='ticketSeat'?'Table / seat':'Phone suffix / car plate')}<input maxLength={80} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm" value={identifiers[key]} onChange={(event)=>setIdentifiers((current)=>({...current,[key]:event.target.value}))}/></label>)}<p className="text-xs leading-5 text-slate-500">{t('These labels apply to this print only. They do not move the order to another table.')}</p></div>}
        </details>}
        </div>
      </div>
      <div className="kitchen-print-controls shrink-0 border-t border-slate-100 px-5 py-4">
        {android && <p className="mb-3 text-xs text-slate-500">{t('Kitchen printing requires Print Helper v0.3.0 or later.')}</p>}
        {(message || !ticket || (hasSavedTableVisitTools && !canPrint)) && <p className="mb-3 text-sm text-amber-800" role="status">{!ticket ? t('Kitchen ticket unavailable.') : message || t('Review print labels before printing.')}</p>}
        <div className="flex gap-2"><button disabled={!canPrint} className="min-h-11 flex-1 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-40" type="button" onClick={() => {
          if (android) { window.location.assign(androidReceiptIntent(ticket)); setMessage(t('Check the helper and paper before reprinting.')) }
          else window.print()
        }}>{t('Print kitchen ticket')}</button>{android && <button disabled={!canPrint} type="button" onClick={() => window.print()}>{t('Print / Save PDF')}</button>}</div>
      </div>
    </div>
  </div>, document.body)
}
