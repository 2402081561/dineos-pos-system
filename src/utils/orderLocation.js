export function orderLocationLabel(order, t = (text) => text) {
  if (order?.pickupCode) return [order.pickupCode, order.pickupReference].filter(Boolean).join(' · ')
  return order?.isWalkIn ? t('Walk-in') : `${t('Table')} ${order?.tableNumber ?? '—'}`
}

// A no-table visit must never share its payment group with another walk-in.
export function paymentBillKey(order) {
  return order.isWalkIn ? `walk-in:${order.tableSessionId}` : String(order.tableNumber ?? order.tableId ?? '—')
}
