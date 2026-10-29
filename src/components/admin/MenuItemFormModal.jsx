import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../common/Button'
import OptionGroupEditor from './OptionGroupEditor'
import { validateOptionGroups } from '../../../server/src/posRules'

const emptyMenuItem = {
  name: '',
  kitchenName: '',
  description: '',
  categoryId: '',
  price: '',
  ingredients: '',
  allergyInformation: '',
  isAvailable: true,
  isPopular: false,
  imageFile: null,
  optionGroups: [],
}

function toFormValues(menuItem) {
  if (!menuItem) return emptyMenuItem

  return {
    ...emptyMenuItem,
    ...menuItem,
    kitchenName: menuItem.kitchenName ?? '',
    ingredients: Array.isArray(menuItem.ingredients) ? menuItem.ingredients.join(', ') : menuItem.ingredients ?? '',
    allergyInformation: Array.isArray(menuItem.allergyInformation) ? menuItem.allergyInformation.join(', ') : menuItem.allergyInformation ?? '',
    imageFile: null,
  }
}

function isHeicFile(file) {
  return file?.type === 'image/heic' || file?.type === 'image/heif' || /\.(heic|heif)$/i.test(file?.name ?? '')
}

function MenuItemFormModal({ categories, error, initialItem, isSubmitting, onCancel, onSubmit, uploadProgress }) {
  const { t: uiText } = useCustomerLanguage()

  const [formData, setFormData] = useState(() => toFormValues(initialItem))
  const [optionError, setOptionError] = useState('')
  const [imagePreview, setImagePreview] = useState(initialItem?.imageUrl ?? '')

  useEffect(() => {
    setFormData(toFormValues(initialItem))
    setImagePreview(initialItem?.imageUrl ?? '')
  }, [initialItem])

  const hasHeicUpload = isHeicFile(formData.imageFile)

  useEffect(() => {
    if (!formData.imageFile) return undefined
    if (isHeicFile(formData.imageFile)) {
      setImagePreview('')
      return undefined
    }

    const previewUrl = URL.createObjectURL(formData.imageFile)
    setImagePreview(previewUrl)

    return () => URL.revokeObjectURL(previewUrl)
  }, [formData.imageFile])

  function updateField(field, value) {
    setFormData((currentData) => ({ ...currentData, [field]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    try { const optionGroups = validateOptionGroups(formData.optionGroups); setOptionError(''); onSubmit({ ...formData, optionGroups }) }
    catch (validationError) { setOptionError(validationError.message) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]">
      <div className="mx-auto flex min-h-full max-w-2xl items-center py-4">
        <form aria-modal="true" className="my-4 w-full animate-[page-enter_180ms_ease-out] rounded-3xl bg-white p-6 shadow-2xl sm:p-8" onSubmit={handleSubmit} role="dialog"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">{uiText("Menu item")}</p><h2 className="mt-1 text-2xl font-bold">{initialItem ? uiText("Edit food") : uiText("Add new food")}</h2></div><button aria-label={uiText("Close dialog")} className="rounded-lg px-2 text-2xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-200" disabled={isSubmitting} onClick={onCancel} type="button">×</button></div><div className="mt-6 grid gap-5 sm:grid-cols-2"><label className="text-sm font-bold">{uiText("Name")}<input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-orange-400" disabled={isSubmitting} onChange={(event) => updateField('name', event.target.value)} required value={formData.name} /></label><label className="text-sm font-bold">{uiText("Category")}<select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-orange-400" disabled={isSubmitting} onChange={(event) => updateField('categoryId', event.target.value)} required value={formData.categoryId}><option value="">{uiText("Select a category")}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="text-sm font-bold sm:col-span-2">{uiText("Description")}<textarea className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-orange-400" disabled={isSubmitting} onChange={(event) => updateField('description', event.target.value)} required value={formData.description} /></label><label className="text-sm font-bold">{uiText("Price (RM)")}<input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-orange-400" disabled={isSubmitting} min="0" onChange={(event) => updateField('price', event.target.value)} required step="0.01" type="number" value={formData.price} /></label><div className="text-sm font-bold">{uiText("Food image")}<input accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/heic,image/heif" className="mt-2 block w-full text-sm font-normal text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:font-semibold file:text-orange-700 hover:file:bg-orange-100" disabled={isSubmitting} onChange={(event) => updateField('imageFile', event.target.files?.[0] ?? null)} required={!initialItem} type="file" /><p className="mt-1 text-xs font-normal text-slate-400">{initialItem ? uiText("Choose a file only to replace the current image.") : uiText("Choose an image from your device.")}{' '}{uiText("JPG, JPEG, PNG, WEBP, HEIC or HEIF, up to 5 MB.")}</p>{hasHeicUpload && <p className="mt-2 rounded-lg bg-orange-50 px-2.5 py-2 text-xs font-medium text-orange-800">{formData.imageFile.name}{' '}{uiText("is ready to upload. Your browser cannot preview HEIC locally, but Cloudinary will process it after upload.")}</p>}</div>{imagePreview && <div className="sm:col-span-2"><p className="text-sm font-bold">{uiText("Image preview")}</p><img alt="Selected food preview" className="mt-2 h-40 w-full rounded-xl object-cover" src={imagePreview} /></div>}<label className="text-sm font-bold sm:col-span-2">{uiText("Ingredients")}<span className="font-normal text-slate-400">{uiText("(comma-separated)")}</span><input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-orange-400" disabled={isSubmitting} onChange={(event) => updateField('ingredients', event.target.value)} placeholder={uiText("Beef Patty, Cheese, Lettuce")} value={formData.ingredients} /></label><label className="text-sm font-bold sm:col-span-2">{uiText("Allergy information")}<span className="font-normal text-slate-400">{uiText("(comma-separated)")}</span><input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-orange-400" disabled={isSubmitting} onChange={(event) => updateField('allergyInformation', event.target.value)} placeholder={uiText("Gluten, Milk")} value={formData.allergyInformation} /></label><label className="text-sm font-bold sm:col-span-2">{uiText("Kitchen short name")}<input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" disabled={isSubmitting} maxLength={40} value={formData.kitchenName ?? ''} onChange={(event) => updateField('kitchenName', event.target.value)} placeholder={uiText("e.g. 奶油鸡饭 / cont kt")} /><span className="mt-1 block text-xs font-normal text-slate-500">{uiText("Kitchen only. Leave blank to use the full dish name. Customer menus and receipts stay unchanged.")}</span></label><OptionGroupEditor disabled={isSubmitting} groups={formData.optionGroups} onChange={(groups) => { updateField('optionGroups', groups); setOptionError('') }} /><label className="flex items-center gap-3 text-sm font-bold"><input checked={formData.isAvailable} className="h-4 w-4 accent-orange-600" disabled={isSubmitting} onChange={(event) => updateField('isAvailable', event.target.checked)} type="checkbox" />{uiText("Available")}</label><label className="flex items-center gap-3 text-sm font-bold"><input checked={formData.isPopular} className="h-4 w-4 accent-orange-600" disabled={isSubmitting} onChange={(event) => updateField('isPopular', event.target.checked)} type="checkbox" />{uiText("Popular")}</label></div>{isSubmitting && formData.imageFile && <div className="mt-5"><div className="flex justify-between text-sm font-semibold text-orange-700"><span>{uiText("Uploading image...")}</span><span>{uploadProgress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-orange-100"><div className="h-full rounded-full bg-orange-500 transition-all duration-200" style={{ width: `${uploadProgress}%` }} /></div></div>}{(error || optionError) && <p className="mt-5 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{uiText(optionError || error)}</p>}<div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button disabled={isSubmitting} onClick={onCancel} variant="outline">{uiText("Cancel")}</Button><Button disabled={isSubmitting} type="submit">{isSubmitting ? (formData.imageFile ? uiText('Uploading image... {{v0}}%', { v0: uploadProgress }) : uiText("Saving food...")) : uiText("Save food")}</Button></div></form>
      </div>
    </div>,
    document.body,
  )
}

export default MenuItemFormModal
