// Table availability has its own wording; food availability still means supply.
export const tableStatusLabels = {
  available: 'Vacant',
  occupied: 'Occupied',
  ordering: 'Ordering',
  awaiting_payment: 'Payment due',
  ready_to_clear: 'Bill settled',
  inactive: 'Disabled',
}

export function tableStatusLabel(status) {
  return tableStatusLabels[status ?? 'available'] ?? String(status ?? '')
}
