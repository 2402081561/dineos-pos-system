// Never fall back to the private, restaurant-wide order number.
export function customerOrderLabel(order) {
  const number = Number(order?.tableOrderNumber)
  return Number.isSafeInteger(number) && number > 0
    ? `Table order ${String(number).padStart(2, '0')}`
    : 'Order'
}

// Counter tickets are visible to this table, but cancellation stays with staff.
export function canCancelCustomerOrder(order) {
  return !order?.isCounterOrder && String(order?.status ?? '').toLowerCase() === 'received'
    && String(order?.paymentStatus ?? 'pending').toLowerCase() !== 'paid'
    && !(order?.items ?? []).some((item) => Number(item.paidQuantity) > 0)
}

export function ordersForParticipant(orders, participant) {
  return orders.filter((order) => order.customerSessionId
    ? order.customerSessionId === participant.id
    : participant.isCurrentCustomer && !order.isCounterOrder)
}

export function unpaidOrderItems(order) {
  return (order.items ?? []).map((item) => ({
    ...item,
    quantity: Math.max(0, Number(item.quantity) - Number(item.paidQuantity ?? 0)),
  })).filter((item) => item.quantity > 0)
}
