import { useId } from 'react'
import { createPortal } from 'react-dom'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import useCustomerDialog from '../../hooks/useCustomerDialog'
import Button from '../common/Button'

export default function ConfirmationDialog({ title, description, confirmLabel = 'Confirm', isLoading, onCancel, onConfirm }) {
  const { t } = useCustomerLanguage()
  const titleId = useId()
  const { dialog, close, keyDown, isClosing } = useCustomerDialog(onCancel)
  return createPortal(<div className={`customer-dialog-backdrop ${isClosing ? 'is-closing' : ''}`} onKeyDown={keyDown}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} className="customer-dialog-panel w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
      <h2 id={titleId} tabIndex={-1} className="text-xl font-bold outline-none">{t(title)}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{t(description)}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-3"><Button disabled={isLoading || isClosing} onClick={close} variant="outline">{t('Cancel')}</Button><Button disabled={isLoading || isClosing} onClick={onConfirm} variant="danger">{t(isLoading ? 'Working...' : confirmLabel)}</Button></div>
    </section>
  </div>, document.body)
}
