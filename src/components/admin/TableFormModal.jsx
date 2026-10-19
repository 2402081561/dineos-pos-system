import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../common/Button'

const emptyTable = { tableNumber: '', capacity: '', isActive: true }

function TableFormModal({ error, initialTable, isSubmitting, onCancel, onSubmit }) {
  const { t: uiText } = useCustomerLanguage()

  const [formData, setFormData] = useState(initialTable ? {
    tableNumber: initialTable.tableNumber ?? '',
    capacity: initialTable.capacity ?? '',
    isActive: initialTable.isActive !== false,
  } : emptyTable)

  useEffect(() => {
    setFormData(initialTable ? {
      tableNumber: initialTable.tableNumber ?? '',
      capacity: initialTable.capacity ?? '',
      isActive: initialTable.isActive !== false,
    } : emptyTable)
  }, [initialTable])

  function updateField(field, value) {
    setFormData((currentData) => ({ ...currentData, [field]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit(formData)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]">
      <div className="mx-auto flex min-h-full max-w-lg items-center py-4">
        <form aria-modal="true" className="my-4 w-full animate-[page-enter_180ms_ease-out] rounded-3xl bg-white p-6 shadow-2xl sm:p-8" onSubmit={handleSubmit} role="dialog">
          <div className="flex items-start justify-between gap-4">
            <div><p className="eyebrow">{uiText("Restaurant table")}</p><h2 className="mt-1 text-2xl font-bold">{initialTable ? uiText("Edit table") : uiText("Add table")}</h2></div>
            <button aria-label={uiText("Close dialog")} className="rounded-lg px-2 text-2xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-200" disabled={isSubmitting} onClick={onCancel} type="button">×</button>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-bold">{uiText("Table number")}<input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-orange-400" disabled={isSubmitting} min="1" onChange={(event) => updateField('tableNumber', event.target.value)} required step="1" type="number" value={formData.tableNumber} /></label>
            <label className="text-sm font-bold">{uiText("Capacity")}<input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-orange-400" disabled={isSubmitting} min="1" onChange={(event) => updateField('capacity', event.target.value)} required step="1" type="number" value={formData.capacity} /></label>
            <label className="flex items-center gap-3 text-sm font-bold sm:col-span-2"><input checked={formData.isActive} className="h-4 w-4 accent-orange-600" disabled={isSubmitting} onChange={(event) => updateField('isActive', event.target.checked)} type="checkbox" />{uiText("Active table")}</label>
          </div>
          {error && <p className="mt-5 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{uiText(error)}</p>}
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button disabled={isSubmitting} onClick={onCancel} variant="outline">{uiText("Cancel")}</Button><Button disabled={isSubmitting} type="submit">{isSubmitting ? uiText("Saving table...") : uiText("Save table")}</Button></div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

export default TableFormModal
