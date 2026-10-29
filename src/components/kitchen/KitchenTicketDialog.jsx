import { useEffect, useRef, useState } from 'react'
import OrderIdentifiers from '../common/OrderIdentifiers'
import { hasSavedTableVisitTools } from '../../utils/deploymentFeatures'
import { createPortal } from 'react-dom'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { buildKitchenTicket } from '../../utils/kitchenTicket'
import { androidReceiptIntent, isAndroidPrintDevice } from '../../utils/androidReceiptPrint'

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
  const canPrint = Boolean(ticket && (!hasSavedTableVisitTools || identifiers.canPrint))
  return createPortal(<div ref={dialogRef} onKeyDown={(event) => {
    if (event.key === 'Escape') onClose()
    if (event.key !== 'Tab') return
    const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), input')]
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }} className="kitchen-print-overlay fixed inset-0 z-[100] overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label={t('Kitchen ticket')}>
    <div className="mx-auto max-w-lg rounded-2xl bg-white p-5">
      <div className="kitchen-print-controls space-y-3">
        <div className="flex justify-between"><h2 className="text-xl font-bold">{t('Kitchen ticket')}</h2><button type="button" onClick={onClose}>{t('Close')}</button></div>
        {hasSavedTableVisitTools ? order&&<OrderIdentifiers key={order.id} orderId={order.id} onState={setIdentifiers}/> : <div className="space-y-2">{['ticketSeat','ticketReference'].map((key)=><label className="block text-sm" key={key}>{t(key==='ticketSeat'?'Table / seat':'Phone suffix / car plate')}<input maxLength={80} className="mt-1 w-full rounded-lg border p-2" value={identifiers[key]} onChange={(event)=>setIdentifiers((current)=>({...current,[key]:event.target.value}))}/></label>)}</div>}
        <p className="text-sm">{t('Kitchen printing requires Print Helper v0.3.0 or later.')}</p>
        <div className="flex gap-2"><button disabled={!canPrint} className="rounded-lg bg-orange-600 p-3 text-white disabled:opacity-40" type="button" onClick={() => {
          if (android) { window.location.assign(androidReceiptIntent(ticket)); setMessage(t('Check the helper and paper before reprinting.')) }
          else window.print()
        }}>{t('Print kitchen ticket')}</button>{android && <button disabled={!canPrint} type="button" onClick={() => window.print()}>{t('Print / Save PDF')}</button>}</div>
        <p role="status">{ticket ? message : t('Kitchen ticket unavailable.')}</p>
      </div>
      {ticket && <article className="kitchen-ticket-paper mx-auto mt-5 max-w-[72mm] bg-white text-black">{ticket.rows.map((row, index) => row.style === 'rule' ? <hr className="my-1 border-dashed border-black" key={index} /> : <p key={index} className={`break-words py-0.5 ${row.style === 'heading' ? 'text-xl font-extrabold' : row.style === 'bold' ? 'text-lg font-bold' : 'text-sm'}`}>{row.left}</p>)}</article>}
    </div>
  </div>, document.body)
}
