import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { createPortal } from 'react-dom'
import Button from '../common/Button'

function getQrImageUrl(content) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&format=png&data=${encodeURIComponent(content)}`
}

function TableQrModal({ onClose, table }) {
  const { t: uiText } = useCustomerLanguage()

  const qrContent = `${window.location.origin}/join?table=${encodeURIComponent(table.tableNumber)}`
  const qrImageUrl = getQrImageUrl(qrContent)
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]">
      <div className="flex min-h-full items-center justify-center py-4">
        <div aria-modal="true" className="w-full max-w-md animate-[page-enter_220ms_ease-out] rounded-3xl bg-white p-6 text-center shadow-2xl sm:p-8" role="dialog"><div className="flex items-start justify-between gap-4 text-left"><div><p className="eyebrow">{uiText("Table")}{' '}{table.tableNumber}</p><h2 className="mt-1 text-2xl font-bold">{uiText("QR ordering code")}</h2></div><button aria-label={uiText("Close dialog")} className="rounded-lg px-2 text-2xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-200" onClick={onClose} type="button">×</button></div><p className="mt-3 text-left text-sm leading-6 text-slate-500">{uiText("Guests can scan this code to begin ordering at this table.")}</p><div className="group mx-auto mt-6 inline-flex rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_12px_28px_rgb(15,23,42,0.08)] transition duration-200 hover:scale-[1.02] hover:shadow-[0_18px_36px_rgb(15,23,42,0.12)]"><img alt={`QR code for table ${table.tableNumber}`} className="h-56 w-56 sm:h-64 sm:w-64" src={qrImageUrl} /></div><p className="mt-5 break-all rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">{qrContent}</p><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button onClick={onClose} variant="outline">{uiText("Close")}</Button><a className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-600/20 transition duration-200 hover:-translate-y-px hover:bg-orange-700 active:translate-y-0" download={`dineos-table-${table.tableNumber}-qr.png`} href={qrImageUrl}>{uiText("↓ Download QR")}</a></div></div>
      </div>
    </div>,
    document.body,
  )
}

export default TableQrModal
