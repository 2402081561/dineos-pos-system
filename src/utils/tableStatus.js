const activeOrderStatuses = new Set(['received', 'preparing', 'ready'])
const cancelledOrderStatuses = new Set(['cancelled', 'canceled'])

function tableKey(value) {
  return String(value ?? '').trim()
}

function validParticipants(tableSession) {
  return Array.isArray(tableSession?.participants)
    ? tableSession.participants.filter((participant) => String(participant?.sessionId ?? '').trim())
    : []
}

export function getOperationalTableStatus(table, orders, tableSession) {
  if (table?.isActive === false) return 'inactive'

  const tableNumber = tableKey(table?.tableNumber)
  const tableOrders = (Array.isArray(orders) ? orders : []).filter((order) => tableKey(order?.tableNumber ?? order?.tableId) === tableNumber)
  const hasAwaitingPayment = tableOrders.some((order) => String(order?.status ?? '').toLowerCase() === 'served'
    && String(order?.paymentStatus ?? 'pending').toLowerCase() !== 'paid')
  if (hasAwaitingPayment) return 'awaiting_payment'

  const hasActiveOrder = tableOrders.some((order) => activeOrderStatuses.has(String(order?.status ?? '').toLowerCase())
    && !cancelledOrderStatuses.has(String(order?.status ?? '').toLowerCase()))
  if (hasActiveOrder) return 'ordering'

  const participants = validParticipants(tableSession)
  if (tableSession?.status === 'active' && participants.length > 0) return 'occupied'
  if (tableSession?.status === 'completed' && participants.length === 0) return 'ready_to_clear'
  return 'available'
}

export function getTableOperationalDetails(table, orders, tableSession) {
  const tableNumber = tableKey(table?.tableNumber)
  const tableOrders = (Array.isArray(orders) ? orders : []).filter((order) => tableKey(order?.tableNumber ?? order?.tableId) === tableNumber)
  const unpaidServedOrders = tableOrders.filter((order) => String(order?.status ?? '').toLowerCase() === 'served'
    && String(order?.paymentStatus ?? 'pending').toLowerCase() !== 'paid')
  return {
    status: getOperationalTableStatus(table, orders, tableSession),
    participantCount: validParticipants(tableSession).length,
    tableOrders,
    unpaidTotal: unpaidServedOrders.reduce((total, order) => {
      const amount = Number(order?.grandTotal)
      return total + (Number.isFinite(amount) && amount >= 0 ? amount : 0)
    }, 0),
  }
}
