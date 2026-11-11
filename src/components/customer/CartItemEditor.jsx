import { useId, useState } from 'react'
import useCustomerDialog from '../../hooks/useCustomerDialog'
import { createPortal } from 'react-dom'
import Button from '../common/Button'
import OptionSelector from '../common/OptionSelector'
import OrderTypeSelector from './CustomerOrderTypeSelector'
import QuantitySelector from './QuantitySelector'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { resolveOptions, roundMoney } from '../../../server/src/posRules'
import { cartItemFingerprint } from '../../utils/cartItemEdit'
import { formatCurrency } from '../../utils/currency'

export default function CartItemEditor({ item, currentItem, food, locked, onSave, onClose }) {
  const { t } = useCustomerLanguage()
  const titleId = useId()
  const { dialog, close, keyDown, isClosing } = useCustomerDialog(onClose)
  const [quantity, setQuantity] = useState(item.quantity)
  const [selections, setSelections] = useState(item.selections ?? [])
  const [notes, setNotes] = useState(item.specialInstructions ?? '')
  const [orderType, setOrderType] = useState(item.orderType ?? 'dine_in')
  const [saveError, setSaveError] = useState('')
  const stale = !currentItem || cartItemFingerprint(currentItem) !== cartItemFingerprint(item)
  const unavailable = !food || food.isAvailable !== true || !Number.isFinite(Number(food.price)) || Number(food.price) < 0
  let options, error = ''
  try { options = resolveOptions(food?.optionGroups ?? [], selections) } catch (issue) { error = issue.message }
  const disabled = locked || stale || unavailable
  const total = !unavailable ? roundMoney((Number(food.price) + (options?.extraPrice ?? 0)) * quantity) : 0
  function save() {
    if (disabled || error || isClosing) return
    const result = onSave({ quantity, selections, specialInstructions: notes, orderType })
    if (result) setSaveError(result)
    else close()
  }
  return createPortal(<div className={`customer-dialog-backdrop ${isClosing ? 'is-closing' : ''}`} onKeyDown={keyDown} onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    <section aria-labelledby={titleId} aria-modal="true" className="customer-dialog-panel w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl sm:p-6" ref={dialog} role="dialog">
      <div className="customer-dialog-heading flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-lg font-extrabold outline-none" id={titleId} tabIndex={-1}>{t('Edit cart item')}</h2><p className="mt-1 break-words text-sm text-slate-500">{item.name}</p></div><Button className="shrink-0 whitespace-nowrap" onClick={close} variant="outline">{t('Close')}</Button></div>
      {stale && !isClosing && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t('This cart item changed. Close the editor and try again.')}</p>}
      {unavailable && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t('This item is currently unavailable and cannot be added to your cart.')}</p>}
      <div className="mt-5"><OptionSelector groups={food?.optionGroups ?? []} selections={selections} onChange={setSelections} disabled={disabled} /></div>
      {error && <div className="mt-2 text-xs text-orange-700"><p role="status">{t(error)}</p>{selections.length > 0 && <button className="mt-1 min-h-11 font-bold underline" disabled={disabled} onClick={() => setSelections([])} type="button">{t('Reset options')}</button>}</div>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><span className="text-sm font-bold">{t('Quantity')}</span><QuantitySelector disabled={disabled} quantity={quantity} onDecrease={() => setQuantity(Math.max(1, quantity - 1))} onIncrease={() => setQuantity(Math.min(50, quantity + 1))} /></div>
      <OrderTypeSelector compact value={orderType} onChange={setOrderType} disabled={disabled} />
      <label className="mt-5 block text-sm font-bold" htmlFor={`${titleId}-note`}>{t('Special instructions')} <span className="font-normal text-slate-400">{t('(optional)')}</span></label>
      <textarea className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 p-3 text-base" disabled={disabled} id={`${titleId}-note`} maxLength={300} onChange={(event) => setNotes(event.target.value)} placeholder={t('No onion, less spicy...')} value={notes} />
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4"><span className="text-sm font-bold">{t('Subtotal')}</span><strong className="text-xl font-extrabold text-orange-600">{formatCurrency(total)}</strong></div>
      {saveError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{t(saveError)}</p>}
      <div className="customer-dialog-actions mt-4 grid grid-cols-2 gap-3"><Button onClick={close} variant="outline">{t('Cancel')}</Button><Button disabled={disabled || Boolean(error) || isClosing} onClick={save}>{t('Save changes')}</Button></div>
    </section>
  </div>, document.body)
}
