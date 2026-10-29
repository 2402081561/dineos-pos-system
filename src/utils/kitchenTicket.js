import { MAX_PRINT_BYTES } from './androidReceiptPrint.js'

export function buildKitchenTicket(order, { tableLabel = '', reference = '', t = (text) => text } = {}) {
  if (!order?.orderNumber || !['received', 'preparing', 'ready'].includes(order.status) || !order.items?.length || !Number.isFinite(new Date(order.createdAt).getTime())) throw new Error('Kitchen ticket unavailable.')
  const clean = (value) => [...String(value ?? '')].map((char) => {
    const code = char.codePointAt(0)
    return code < 32 || (code >= 127 && code <= 159) ? ' ' : char
  }).join('').trim()
  if (tableLabel.length > 80 || reference.length > 80) throw new Error('Kitchen ticket unavailable.')
  const rows = []
  const row = (left, style = 'normal') => rows.push({ left: clean(left), right: '', style })
  row(t('Kitchen ticket'), 'heading')
  row(tableLabel.trim() || (order.tableNumber ?? '—'), 'heading')
  if (reference.trim()) row(reference, 'heading')
  if (order.revisionNote) row(`${t('Order changed')}: ${order.revisionNote}`, 'bold')
  row('', 'rule')
  const groups = new Map([['dine_in', []], ['take_away', []]])
  for (const item of order.items) {
    if (!Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1) throw new Error('Kitchen ticket unavailable.')
    const type = item.orderType ?? order.orderType
    if (!groups.has(type)) throw new Error('Kitchen ticket unavailable.')
    groups.get(type).push(item)
  }
  let printedGroup = false
  for (const [type, items] of groups) {
    if (!items.length) continue
    if (printedGroup) row('', 'rule')
    row(`【${t(type === 'take_away' ? 'TAKE AWAY' : 'Dine in')}】`, 'bold')
    for (const item of items) {
      const name = String(item.kitchenName || item.name || '').trim()
      if (!name) throw new Error('Kitchen ticket unavailable.')
      row(`${item.quantity}× ${name}`, 'bold')
      const options = (item.optionSnapshot ?? []).flatMap((group) => (group.options ?? []).map((option) => option.label)).filter(Boolean).join('、')
      if (options) row(options)
      if (item.notes) row(`${t('Notes')}: ${item.notes}`, 'bold')
    }
    printedGroup = true
  }
  row('', 'rule')
  const payload = { version: 1, kind: 'kitchen_ticket', receiptNumber: String(order.orderNumber), rows }
  if (rows.length > 300 || rows.some((entry) => entry.left.length > 1000) || new TextEncoder().encode(JSON.stringify(payload)).length > MAX_PRINT_BYTES) throw new Error('Kitchen ticket unavailable.')
  return payload
}
