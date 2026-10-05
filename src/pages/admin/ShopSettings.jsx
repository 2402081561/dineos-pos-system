import { useState } from 'react'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import useShopSettings from '../../hooks/useShopSettings'

export default function ShopSettings() {
  const { name, isLoading, error: loadError, refresh, saveName } = useShopSettings()
  const [draft, setDraft] = useState(null)
  const [expectedName, setExpectedName] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const value = draft ?? name
  const normalized = value.trim()
  const isValid = Boolean(normalized && Array.from(normalized).length <= 80 && !Array.from(normalized).some((character) => character.charCodeAt(0) < 32 || (character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159)))

  async function submit(event) {
    event.preventDefault()
    if (isSaving || isLoading || loadError || !isValid || normalized === name) return
    setIsSaving(true)
    setError('')
    setSaved(false)
    try {
      await saveName(normalized, expectedName ?? name)
      setDraft(null)
      setSaved(true)
    } catch (saveError) {
      setError(saveError.message || 'The shop name could not be saved. Please try again.')
    } finally { setIsSaving(false) }
  }

  return <div className="mx-auto max-w-3xl space-y-6">
    <SectionHeading eyebrow="Administration" title="Shop settings" description="Set the name for your restaurant. All staff accounts use the same single-store settings." />
    <form className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7" onSubmit={submit}>
      <label className="block text-sm font-bold text-slate-800" htmlFor="shop-name">Shop name</label>
      <input aria-describedby="shop-name-help" autoComplete="organization" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:border-orange-400 disabled:bg-slate-50" disabled={isLoading || isSaving || Boolean(loadError)} id="shop-name" onChange={(event) => { if (draft === null) setExpectedName(name); setDraft(event.target.value); setSaved(false); setError('') }} placeholder="e.g. Sin Ma Stir Fried" required value={value} />
      <p className="mt-2 text-sm text-slate-500" id="shop-name-help">Chinese and English names are supported, up to 80 characters. Used on customer pages, staff portals and new receipts.</p>
      <div className="mt-5 rounded-2xl bg-orange-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-orange-700">Name preview</p><p className="mt-2 break-words text-xl font-bold text-slate-900">{normalized || 'Your restaurant name'}</p></div>
      <p className="mt-4 text-xs leading-5 text-slate-500">New receipts keep the name used at payment time. Older receipts without a saved name display the current shop name. DineOS remains the system brand.</p>
      {isLoading && <p className="mt-4 text-sm text-slate-500" role="status">Loading shop settings...</p>}
      {(loadError || error) && <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700" role="alert"><p>{loadError || error}</p><Button className="mt-3" disabled={isSaving} onClick={() => { setDraft(null); setExpectedName(null); setError(''); setSaved(false); void refresh() }} variant="outline">Reload current settings</Button></div>}
      {!isValid && draft !== null && <p className="mt-4 text-sm text-red-700" role="alert">Enter 1 to 80 characters without line breaks or control characters.</p>}
      {saved && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">Shop name saved.</p>}
      <div className="mt-6 flex flex-wrap gap-3"><Button disabled={isLoading || Boolean(loadError) || !isValid || normalized === name} isLoading={isSaving} type="submit">Save shop name</Button><Button disabled={isSaving || draft === null} onClick={() => { setDraft(null); setError(''); setSaved(false) }} variant="outline">Cancel changes</Button></div>
    </form>
  </div>
}
