// A table number alone is never proof that an old order belongs to its current visit.
export function canOpenCurrentOrderVisit(order, floor) {
  if (!order || floor?.error || floor?.isLoading || order.tableSessionStatus !== 'active' || !order.tableId || !order.tableSessionId || order.paymentStatus !== 'pending' || order.status === 'cancelled') return false
  const table = floor.floorTables?.find((entry) => entry.id === order.tableId)
  return Boolean(table && table.tableSessionId === order.tableSessionId)
}

export function orderWaitingMinutes(order, now = Date.now()) {
  if (order.tableSessionStatus !== 'active' || !['received', 'preparing'].includes(order.status)) return null
  const created = new Date(order.createdAt).getTime()
  if (!Number.isFinite(created) || created > now) return null
  return Math.floor((now - created) / 60000)
}
