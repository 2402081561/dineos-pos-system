import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useState } from 'react'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import useShopSettings from '../../hooks/useShopSettings'
import { defaultConfig, validateStoreConfig } from '../../../server/src/posRules'
import { uploadMenuImage } from '../../services/cloudinaryService'
import ChargeSettings from '../../components/admin/ChargeSettings'

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const inputClass = 'mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400'
export default function ShopSettings() {
  const { t: uiText } = useCustomerLanguage()

  const { settings, isLoading, error: loadError, refresh, saveSettings } = useShopSettings()
  const [draft, setDraft] = useState(null)
  const [isSaving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const value = draft ?? settings
  const config = { ...defaultConfig, ...value.config }
  const disabled = isSaving || isLoading || uploading || Boolean(loadError)
  function change(key, next) {
    setDraft({ ...value, config: { ...config, [key]: next } })
    setSaved(false); setError('')
  }
  async function submit(event) {
    event.preventDefault()
    if (disabled || !draft) return
    setSaving(true); setError(''); setSaved(false)
    try {
      const next = { ...draft, config: validateStoreConfig(draft.config) }
      await saveSettings(next, draft.revision)
      setDraft(null); setSaved(true)
    } catch (saveError) { setError(saveError.message) }
    finally { setSaving(false) }
  }
  async function uploadLogo(file) {
    if (!file) return
    setUploading(true); setError('')
    try { change('logoUrl', await uploadMenuImage(file)) }
    catch (uploadError) { setError(uploadError.message || 'Logo upload failed.') }
    finally { setUploading(false) }
  }
  return <div className="mx-auto max-w-5xl space-y-5">
    <SectionHeading eyebrow={uiText("Administration")} title={uiText("Shop settings")} description={uiText("One restaurant · shared by all staff. Saved receipts keep their original shop details and charges.")} />
    <form className="space-y-5" onSubmit={submit}>
      <fieldset disabled={disabled} className="surface-card grid gap-5 p-5 sm:grid-cols-2">
        <legend className="sr-only">{uiText("Shop and receipt details")}</legend>
        <h2 className="text-lg font-bold sm:col-span-2">{uiText("Shop & receipt details")}</h2>
        <label className="text-sm font-semibold">{uiText("Shop name")}<input className={inputClass} maxLength={80} required value={value.name} onChange={(e) => { setDraft({ ...value, name: e.target.value, config }); setSaved(false) }} /></label>
        <label className="text-sm font-semibold">{uiText("Phone")}<input className={inputClass} maxLength={40} value={config.phone} onChange={(e) => change('phone', e.target.value)} /></label>
        <label className="text-sm font-semibold sm:col-span-2">{uiText("Address")}<textarea className={inputClass} maxLength={300} rows={2} value={config.address} onChange={(e) => change('address', e.target.value)} /></label>
        <label className="text-sm font-semibold">{uiText("Logo image URL")}<input className={inputClass} type="url" placeholder={uiText("https://...")} value={config.logoUrl} onChange={(e) => change('logoUrl', e.target.value)} /><span className="mt-2 block text-xs font-normal text-slate-500">{uiText("Use an HTTPS image URL, or upload an image.")}</span><input aria-label={uiText("Upload shop logo")} className="mt-2 w-full text-xs" accept="image/*" type="file" onChange={(e) => void uploadLogo(e.target.files[0])} /></label>
        <div className="rounded-xl bg-slate-50 p-4 text-center">{config.logoUrl && <img className="mx-auto mb-2 h-20 max-w-40 object-contain" src={config.logoUrl} alt="Shop logo preview" />}<p className="font-bold">{value.name}</p><p className="whitespace-pre-line text-xs text-slate-500">{config.address}</p><p className="text-xs">{config.phone}</p></div>
        <label className="text-sm font-semibold sm:col-span-2">{uiText("Receipt footer")}<textarea className={inputClass} maxLength={300} rows={2} value={config.receiptFooter} onChange={(e) => change('receiptFooter', e.target.value)} /></label>
      </fieldset>
      <fieldset disabled={disabled} className="surface-card space-y-4 p-5">
        <legend className="sr-only">{uiText("Charges")}</legend><h2 className="text-lg font-bold">{uiText("Charges")}</h2>
        <ChargeSettings config={config} onChange={change} />
        <p className="text-xs leading-5 text-slate-500">{uiText("Switch off any charge your restaurant does not collect, then save settings. Both percentages apply to the discounted food subtotal. Changes apply to new orders only; existing orders and paid receipts retain their original charges. Service charge is a restaurant fee, separate from SST. Set SST according to your restaurant's applicable requirements.")}</p>
      </fieldset>
      <fieldset disabled={disabled} className="surface-card space-y-4 p-5">
        <legend className="sr-only">{uiText('Food handoff')}</legend><h2 className="text-lg font-bold">{uiText('Food handoff')}</h2>
        <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={config.requireHandoffConfirmation} onChange={(e) => change('requireHandoffConfirmation', e.target.checked)} />{uiText('Require staff to confirm served or collected')}</label>
        <p className="text-xs leading-5 text-slate-500">{uiText('When off, staff do not need to confirm each item. After all orders are ready and paid, the cashier may clear the table. Food is not recorded as served or collected. This setting applies to current and future visits.')}</p>
      </fieldset>
      <fieldset disabled={disabled} className="surface-card space-y-4 p-5">
        <legend className="sr-only">{uiText("Kitchen estimates")}</legend><h2 className="text-lg font-bold">{uiText("Kitchen estimates")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">{[['kitchenCapacity', 'Portions prepared simultaneously', 20], ['preparationMinMinutes', 'Minimum minutes per portion', 120], ['preparationMaxMinutes', 'Maximum minutes per portion', 120]].map(([key, label, max]) => <label className="text-sm font-semibold" key={key}>{uiText(label)}<input className={inputClass} type="number" min="1" max={max} step="1" required value={config[key]} onChange={(event) => change(key, event.target.value)} /></label>)}</div>
        <p className="text-xs leading-5 text-slate-500">{uiText("Estimates include received and preparing orders from all tables and the counter, for both dine-in and take-away. Ready, served and cancelled orders do not occupy the queue. This is an approximate portion-based model, not an exact time for every dish. Adjust to your kitchen's actual speed; it never marks food ready automatically.")}</p>
      </fieldset>
      <fieldset disabled={disabled} className="surface-card space-y-4 p-5">
        <legend className="sr-only">{uiText("QR ordering and hours")}</legend><h2 className="text-lg font-bold">{uiText("QR ordering & opening hours")}</h2>
        <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={config.acceptingOrders} onChange={(e) => change('acceptingOrders', e.target.checked)} />{uiText("Accept customer QR orders")}</label>
        <p className="text-xs text-slate-500">{uiText("When paused, customers can still view the menu and existing orders. Staff can continue taking counter orders.")}</p>
        <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={config.takeawayQrEnabled} onChange={event=>change('takeawayQrEnabled',event.target.checked)}/>{uiText('Enable separate take-away QR ordering')}</label>
        <p className="text-xs text-slate-500">{uiText('Requires database upgrade 037. Take-away QR uses the same opening hours and pause switch. Find its code in Tables.')}</p>
        <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={config.enforceOpeningHours} onChange={(e) => change('enforceOpeningHours', e.target.checked)} />{uiText("Only accept QR orders during opening hours")}</label>
        <p className="text-xs text-slate-500">{uiText("Malaysia time (Asia/Kuching). A closing time earlier than opening time means overnight.")}</p>
        <div className="space-y-2">{config.openingHours.map((entry, day) => <div className="grid grid-cols-2 items-center gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[120px_100px_1fr_1fr]" key={day}><strong className="text-sm">{uiText(days[day])}</strong><label className="text-xs"><input className="mr-2" type="checkbox" checked={entry.closed} onChange={(e) => change('openingHours', config.openingHours.map((row, index) => index === day ? { ...row, closed: e.target.checked } : row))} />{uiText("Closed")}</label>{['open', 'close'].map((key) => <label className="text-xs text-slate-500" key={key}>{key === 'open' ? uiText("Open") : uiText("Close")}<input aria-label={days[day] + ' ' + key} className={inputClass} type="time" disabled={entry.closed} value={entry[key]} onChange={(e) => change('openingHours', config.openingHours.map((row, index) => index === day ? { ...row, [key]: e.target.value } : row))} /></label>)}</div>)}</div>
      </fieldset>
      {(loadError || error) && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{uiText(loadError || error)}<Button className="ml-3" variant="outline" disabled={isSaving} onClick={() => { setDraft(null); setError(''); void refresh() }}>{uiText("Reload settings")}</Button></div>}
      {saved && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{uiText("Shop settings saved.")}</p>}
      {uploading && <p role="status">{uiText("Uploading logo...")}</p>}
      <div className="flex gap-3"><Button type="submit" disabled={disabled || !draft} isLoading={isSaving}>{uiText("Save settings")}</Button><Button variant="outline" disabled={isSaving || !draft} onClick={() => { setDraft(null); setError(''); setSaved(false) }}>{uiText("Cancel changes")}</Button></div>
    </form>
  </div>
}
