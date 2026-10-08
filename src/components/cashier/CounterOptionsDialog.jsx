import { useState } from 'react'
import PosDialog from '../common/PosDialog'
import OptionSelector from '../common/OptionSelector'
import Button from '../common/Button'
import { resolveOptions } from '../../../server/src/posRules'
import { formatCurrency } from '../../utils/currency'

export default function CounterOptionsDialog({ item, onClose, onAdd }) {
  const [selections, setSelections] = useState([])
  let resolved, error = ''
  try { resolved = resolveOptions(item.optionGroups, selections) } catch (validationError) { error = validationError.message }
  return <PosDialog title={item.name} onClose={onClose}>
    <OptionSelector groups={item.optionGroups} selections={selections} onChange={setSelections} />
    {error && <p role="status" className="mt-4 text-sm text-orange-700">{error}</p>}
    <div className="mt-5 flex items-center justify-between gap-3"><strong>{formatCurrency(Number(item.price) + (resolved?.extraPrice ?? 0))}</strong><Button disabled={Boolean(error)} onClick={() => { onAdd(item, resolved); onClose() }}>Add to order</Button></div>
  </PosDialog>
}
