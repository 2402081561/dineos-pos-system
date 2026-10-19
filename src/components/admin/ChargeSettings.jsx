import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useRef } from 'react'

const charges = [
  { key: 'serviceChargeRate', label: 'Service charge', defaultRate: 10 },
  { key: 'sstRate', label: 'SST', defaultRate: 6 },
]

export default function ChargeSettings({ config, onChange }) {
  const { t: uiText } = useCustomerLanguage()

  const rememberedRates = useRef({})
  return <div className="grid gap-4 sm:grid-cols-2">
    {charges.map(({ key, label, defaultRate }) => {
      const enabled = config[key] === '' || Number(config[key]) > 0
      return <div key={key} className="rounded-xl border border-slate-200 p-4">
        <label className="flex items-center justify-between gap-3 text-sm font-semibold">
          {uiText(label)}
          <input type="checkbox" aria-label={uiText("Enable {{v0}}", { v0: label })} checked={enabled} onChange={(event) => {
            if (!event.target.checked) rememberedRates.current[key] = config[key]
            onChange(key, event.target.checked ? rememberedRates.current[key] || defaultRate : 0)
          }} />
        </label>
        <label className="mt-3 block text-xs font-medium text-slate-500">{uiText("Rate (%)")}<input aria-label={uiText("{{v0}} rate (%)", { v0: label })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-400" type="number" min="0" max="100" step="0.01" required disabled={!enabled} value={config[key]} onChange={(event) => onChange(key, event.target.value)} />
        </label>
        <p className="mt-2 text-xs text-slate-500">{enabled ? uiText('{{v0}}% applies to new orders.', { v0: config[key] }) : uiText("Off · no charge on new orders.")}</p>
      </div>
    })}
  </div>
}
