import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { formatCurrency } from '../../utils/currency'

export default function OptionSelector({ groups = [], selections = [], onChange, disabled = false }) {
  const { t: uiText } = useCustomerLanguage()

  const { t } = useCustomerLanguage()
  function toggle(group, option) {
    const selected = selections.find((entry) => entry.groupId === group.id)?.optionIds ?? []
    const ids = selected.includes(option.id) ? selected.filter((id) => id !== option.id) : group.max === 1 ? [option.id] : [...selected, option.id]
    onChange([...selections.filter((entry) => entry.groupId !== group.id), { groupId: group.id, optionIds: ids }])
  }
  return <div className="space-y-4">{groups.map((group) => {
    const selected = selections.find((entry) => entry.groupId === group.id)?.optionIds ?? []
    return <fieldset key={group.id} disabled={disabled} className="rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-sm font-bold">{group.name} <span className="text-xs font-normal text-slate-500">{group.min ? t('Required') : t('Optional')} · {t('Choose {{min}}–{{max}}', { min: group.min, max: group.max })}</span></legend>
      <div className="space-y-2">{group.options.map((option) => <label key={option.id} className={`flex items-center justify-between gap-3 rounded-lg p-2 text-sm ${selected.includes(option.id) ? 'bg-orange-50' : 'bg-slate-50'} ${!option.isAvailable ? 'opacity-50' : ''}`}><span className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={selected.includes(option.id)} disabled={!option.isAvailable || (!selected.includes(option.id) && group.max > 1 && selected.length >= group.max)} onChange={() => toggle(group, option)} /><span className="break-words">{uiText(option.label)}{!option.isAvailable && ' · ' + t('Sold out')}</span></span><span className="shrink-0 text-xs font-semibold">{Number(option.price) ? '+' + formatCurrency(option.price) : t('No extra charge')}</span></label>)}</div>
    </fieldset>
  })}</div>
}
