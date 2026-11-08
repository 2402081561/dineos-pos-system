export function currentRecentOrderTable(order, floor) {
  if (!order?.tableSessionId || order.tableSessionStatus !== 'active' || floor?.error || floor?.isLoading) return null
  if (order.isWalkIn && !order.tableId) return { id: null, isWalkIn: true, tableSessionId: order.tableSessionId }
  if (!order.tableId) return null
  return floor?.floorTables?.find((table) => table.id === order.tableId && table.tableSessionId === order.tableSessionId) ?? null
}

export function recentOrderPayment(order, floor) {
  if (!currentRecentOrderTable(order, floor) || order.paymentStatus !== 'pending' || order.status === 'cancelled') return null
  return floor.paymentTables?.find((table) => table.orders?.length && table.orders.some((entry) => entry.id === order.id)
    && table.orders.every((entry) => entry.tableSessionId === order.tableSessionId && (!entry.tableId || entry.tableId === order.tableId))) ?? null
}

export function canEditRecentOrder(order, floor, role) {
  return Boolean(currentRecentOrderTable(order, floor) && ['admin', 'cashier'].includes(role)
    && order.paymentStatus === 'pending' && ['received', 'preparing', 'ready'].includes(order.status)
    && (role === 'admin' || order.status === 'received') && order.items?.length
    && !order.items.some((item) => Number(item.paidQuantity) > 0 || Number(item.fulfilledQuantity) > 0))
}
