import { createPortal } from 'react-dom'
import Button from './Button'

function ConfirmationDialog({ title, description, confirmLabel = 'Confirm', isLoading, onCancel, onConfirm }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
      <div aria-modal="true" className="w-full max-w-md animate-[page-enter_180ms_ease-out] rounded-3xl bg-white p-6 shadow-2xl sm:p-7" role="dialog"><h2 className="text-xl font-bold text-slate-900">{title}</h2><p className="mt-3 text-sm leading-6 text-slate-500">{description}</p><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button disabled={isLoading} onClick={onCancel} variant="outline">Cancel</Button><Button disabled={isLoading} onClick={onConfirm} variant="danger">{isLoading ? 'Working...' : confirmLabel}</Button></div></div>
    </div>,
    document.body,
  )
}

export default ConfirmationDialog
