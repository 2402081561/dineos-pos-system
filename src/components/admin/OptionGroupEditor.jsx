import Button from '../common/Button'

const inputClass = 'w-full min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-sm'
const newOption = () => ({ id: crypto.randomUUID(), label: '', price: 0, isAvailable: true })
export default function OptionGroupEditor({ groups = [], onChange, disabled }) {
  function update(id, changes) { onChange(groups.map((group) => group.id === id ? { ...group, ...changes } : group)) }
  function optionUpdate(group, id, changes) { update(group.id, { options: group.options.map((option) => option.id === id ? { ...option, ...changes } : option) }) }
  return <fieldset disabled={disabled} className="space-y-4 rounded-xl border border-slate-200 p-4 sm:col-span-2">
    <legend className="px-1 text-sm font-bold">Dish options & add-ons</legend>
    <p className="text-xs text-slate-500">Example: Temperature (minimum 1, maximum 1); Add-ons (minimum 0, maximum 3). Prices are added to the dish price. Existing orders keep their original choices.</p>
    {groups.map((group, index) => <section className="space-y-3 rounded-xl bg-slate-50 p-3" key={group.id}>
      <div className="flex items-start gap-2"><label className="min-w-0 flex-1 text-xs font-semibold">Group name<input aria-label={`Group ${index + 1} name`} className={inputClass} maxLength={80} required placeholder="e.g. Temperature" value={group.name} onChange={(e) => update(group.id, { name: e.target.value })} /></label><Button className="mt-4 text-xs" variant="danger" onClick={() => onChange(groups.filter((entry) => entry.id !== group.id))}>Remove group</Button></div>
      <div className="grid grid-cols-2 gap-3">{['min', 'max'].map((key) => <label className="text-xs font-semibold" key={key}>{key === 'min' ? 'Minimum selections' : 'Maximum selections'}<input aria-label={`Group ${index + 1} ${key}`} className={inputClass} min={key === 'min' ? 0 : 1} max={20} required type="number" value={group[key]} onChange={(e) => update(group.id, { [key]: e.target.value === '' ? '' : Number(e.target.value) })} /></label>)}</div>
      {group.options.map((option, optionIndex) => <div className="grid grid-cols-[minmax(0,1fr)_90px] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_90px_75px_36px]" key={option.id}>
        <label className="text-xs">Option name<input aria-label={`Group ${index + 1} option ${optionIndex + 1} name`} className={inputClass} required maxLength={80} placeholder="e.g. Hot" value={option.label} onChange={(e) => optionUpdate(group, option.id, { label: e.target.value })} /></label>
        <label className="text-xs">Extra RM<input aria-label={`Group ${index + 1} option ${optionIndex + 1} price`} className={inputClass} type="number" min={0} max={999999.99} step="0.01" required value={option.price} onChange={(e) => optionUpdate(group, option.id, { price: e.target.value })} /></label>
        <label className="py-2 text-xs"><input className="mr-1" type="checkbox" checked={option.isAvailable} onChange={(e) => optionUpdate(group, option.id, { isAvailable: e.target.checked })} />Available</label>
        <button aria-label={`Remove option ${optionIndex + 1} from group ${index + 1}`} className="rounded-lg p-2 text-red-600" type="button" onClick={() => update(group.id, { options: group.options.filter((entry) => entry.id !== option.id) })}>×</button>
      </div>)}
      <Button className="text-xs" variant="outline" disabled={group.options.length >= 20} onClick={() => update(group.id, { options: [...group.options, newOption()] })}>+ Add option</Button>
    </section>)}
    <Button variant="outline" disabled={groups.length >= 10} onClick={() => onChange([...groups, { id: crypto.randomUUID(), name: '', min: 0, max: 1, options: [newOption()] }])}>+ Add option group</Button>
  </fieldset>
}
