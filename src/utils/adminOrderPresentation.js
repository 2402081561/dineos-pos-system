export function orderNumber(order) {
  return order.orderNumber ?? `#${String(order.id).slice(-6).toUpperCase()}`
}

export function orderTable(order) {
  return order.tableNumber ?? order.tableId?.replace('temporary-table-', '') ?? '—'
}

export function orderDate(value) {
  if (!value) return '—'
  const date = value?.toDate?.() ?? new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-MY', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuching',
  }).format(date)
}

export function orderStatusLabel(status) {
  return ({ received: 'Received', preparing: 'Preparing', ready: 'Food ready', served: 'Served / collected', cancelled: 'Cancelled' })[status] ?? String(status ?? 'Received')
}

export function orderPaymentLabel(order) {
  if (order.paymentStatus === 'paid') return 'Paid'
  return Number(order.paidAmount) > 0 || order.items?.some((item) => Number(item.paidQuantity) > 0) ? 'Partly paid' : 'Not paid'
}

export function orderTypeLabel(type) {
  return ({ dine_in: 'Dine in', take_away: 'Take away', mixed: 'Dine in / Take away' })[type] ?? 'Dine in'
}

export function orderStatusStyle(status) {
  return ({ served: 'bg-emerald-50 text-emerald-700', ready: 'bg-blue-50 text-blue-700', preparing: 'bg-amber-50 text-amber-700', cancelled: 'bg-slate-100 text-slate-500' })[status] ?? 'bg-orange-50 text-orange-700'
}
