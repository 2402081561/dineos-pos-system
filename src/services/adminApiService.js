import { authenticatedApiRequest } from './supabaseAuthService'
import { subscribePoll as poll, watchPoll } from '../utils/pollSubscription'

export function subscribeToSupabaseAdminOrders(onData, onError) {
  return poll(async () => (await authenticatedApiRequest('/api/v1/admin/orders')).orders, onData, onError)
}

export async function cancelSupabaseAdminOrder(orderId, reason, expectedVersion) {
  return (await authenticatedApiRequest(`/api/v1/admin/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'PATCH', body: { reason, expectedVersion } })).order
}

export function subscribeToSupabaseAdminMenu(onData, onError) {
  return poll(async () => {
    const [menu, categories] = await Promise.all([
      authenticatedApiRequest('/api/v1/admin/menu-items'),
      authenticatedApiRequest('/api/v1/admin/categories'),
    ])
    return { categories: categories.categories, menuItems: menu.items }
  }, onData, onError)
}

export function subscribeToSupabaseAdminTables(onData, onError) {
  return poll(async () => (await authenticatedApiRequest('/api/v1/admin/tables')).tables, onData, onError)
}

export async function createSupabaseAdminTable(table) { return (await authenticatedApiRequest('/api/v1/admin/tables', { method: 'POST', body: { ...table, isEnabled: table.isActive !== false } })).table }
export async function updateSupabaseAdminTable(id, table) { return (await authenticatedApiRequest(`/api/v1/admin/tables/${encodeURIComponent(id)}`, { method: 'PATCH', body: { ...table, isEnabled: table.isActive !== false } })).table }
export async function deleteSupabaseAdminTable(id) { await authenticatedApiRequest(`/api/v1/admin/tables/${encodeURIComponent(id)}`, { method: 'DELETE' }) }
export async function clearSupabaseAdminTable(id) { return authenticatedApiRequest(`/api/v1/admin/tables/${encodeURIComponent(id)}/clear`, { method: 'POST' }) }
export async function clearSupabaseCashierTable(id, expectedTableSessionId) { return authenticatedApiRequest(`/api/v1/admin/tables/${encodeURIComponent(id)}/clear`, { method: 'POST', ...(expectedTableSessionId ? { body: { expectedTableSessionId } } : {}) }) }

export function subscribeToSupabaseCategories(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/admin/categories')).categories.map((item) => ({ ...item, isActive: item.isEnabled })), onData, onError) }
export async function createSupabaseCategory(category) { return (await authenticatedApiRequest('/api/v1/admin/categories', { method: 'POST', body: { ...category, isEnabled: category.isActive !== false } })).category }
export async function updateSupabaseCategory(id, category) { return (await authenticatedApiRequest(`/api/v1/admin/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: { ...category, isEnabled: category.isActive !== false } })).category }
export async function deleteSupabaseCategory(id) { await authenticatedApiRequest(`/api/v1/admin/categories/${encodeURIComponent(id)}`, { method: 'DELETE' }) }
export async function updateSupabaseCategoryActive(category, isActive) { return updateSupabaseCategory(category.id, { ...category, isActive }) }

export async function createSupabaseMenuItem(item) { return (await authenticatedApiRequest('/api/v1/admin/menu-items', { method: 'POST', body: item })).item }
export async function updateSupabaseMenuItem(id, item) { return (await authenticatedApiRequest(`/api/v1/admin/menu-items/${encodeURIComponent(id)}`, { method: 'PATCH', body: item })).item }
export async function deleteSupabaseMenuItem(id) { await authenticatedApiRequest(`/api/v1/admin/menu-items/${encodeURIComponent(id)}`, { method: 'DELETE' }) }
export async function updateSupabaseMenuFlags(item, updates) {
  if (typeof updates.isAvailable === 'boolean' && Object.keys(updates).length === 1) return (await authenticatedApiRequest(`/api/v1/admin/menu-items/${encodeURIComponent(item.id)}/availability`, { method: 'PATCH', body: updates })).item
  return updateSupabaseMenuItem(item.id, { ...item, ...updates })
}

export function subscribeToSupabaseAdminDashboard(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/admin/dashboard')).dashboard, onData, onError) }
export function subscribeToSupabaseAuditLogs(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/admin/audit-logs')).logs, onData, onError, 15000) }
export function subscribeToSupabaseReportData(onData, onError) {
  return poll(async () => {
    const [orders, requests, menu, categories, tables, payments, refunds] = await Promise.all([
      authenticatedApiRequest('/api/v1/admin/orders'),
      authenticatedApiRequest('/api/v1/staff/service-requests'),
      authenticatedApiRequest('/api/v1/admin/menu-items'),
      authenticatedApiRequest('/api/v1/admin/categories'),
      authenticatedApiRequest('/api/v1/admin/tables'),
      authenticatedApiRequest('/api/v1/admin/payment-events'),
      authenticatedApiRequest('/api/v1/admin/refund-events'),
    ])
    return { refunds: refunds.refunds, refundsAvailable: refunds.refundsAvailable, payments: payments.payments, orders: orders.orders, requests: requests.requests, menuItems: menu.items, categories: categories.categories.map((category) => ({ ...category, isActive: category.isEnabled })), tables: tables.tables.map((table) => ({ ...table, isActive: table.isEnabled })) }
  }, onData, onError, 15000)
}
export function subscribeToSupabaseMembers(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/admin/members')).members, onData, onError, 15000) }
export function subscribeToSupabaseMemberPoints(memberId, onData, onError) { return poll(async () => (await authenticatedApiRequest(`/api/v1/admin/members/${encodeURIComponent(memberId)}/points`)).transactions, onData, onError, 15000) }
export function subscribeToSupabaseRewards(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/admin/rewards')).rewards, onData, onError, 15000) }
export async function saveSupabaseReward(input, id = '') { return (await authenticatedApiRequest(id ? `/api/v1/admin/rewards/${encodeURIComponent(id)}` : '/api/v1/admin/rewards', { method: id ? 'PATCH' : 'POST', body: input })).reward }
export async function getSupabaseTableOrders(tableId, tableSessionId) { return (await authenticatedApiRequest(`/api/v1/cashier/tables/${encodeURIComponent(tableId)}/orders${tableSessionId ? `?tableSessionId=${encodeURIComponent(tableSessionId)}` : ''}`)).orders }
export async function getSupabaseOrderDetails(orderId) {
  const { order } = await authenticatedApiRequest(`/api/v1/cashier/orders/${encodeURIComponent(orderId)}`)
  if (order?.id !== orderId || !Array.isArray(order.items)) throw new Error('Order details unavailable')
  return order
}
export async function changeSupabaseOrder(orderId, changes) { return authenticatedApiRequest(`/api/v1/cashier/orders/${encodeURIComponent(orderId)}/items`, { method: 'PATCH', body: changes }) }
export async function getSupabaseKitchenOrders(signal) { return (await authenticatedApiRequest('/api/v1/kitchen/orders', { signal })).orders }
export function subscribeToSupabaseKitchenOrders(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/kitchen/orders')).orders, onData, onError, 5000) }
export async function updateSupabaseKitchenOrderStatus(orderId, status, expectedStatus, expectedVersion) { return (await authenticatedApiRequest(`/api/v1/kitchen/orders/${encodeURIComponent(orderId)}/status`, { method: 'PATCH', body: { status, expectedStatus, expectedVersion } })).order }
export async function getSupabaseServiceRequests() { return (await authenticatedApiRequest('/api/v1/staff/service-requests')).requests }
export function subscribeToSupabaseServiceRequests(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/staff/service-requests')).requests, onData, onError, 5000) }
export async function completeSupabaseServiceRequest(requestId) { return (await authenticatedApiRequest(`/api/v1/staff/service-requests/${encodeURIComponent(requestId)}/complete`, { method: 'PATCH' })).request }
export async function findSupabaseCashierMember(identifier) { return (await authenticatedApiRequest(`/api/v1/cashier/members/${encodeURIComponent(identifier)}`)).member }
export function subscribeToSupabaseCashierRewards(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/cashier/rewards')).rewards, onData, onError, 15000) }
export async function redeemSupabaseCashierReward(memberId, rewardId) { return (await authenticatedApiRequest(`/api/v1/cashier/rewards/${encodeURIComponent(rewardId)}/redeem`, { method: 'POST', body: { memberId } })).redemption }
export async function completeSupabaseTablePayment({ orderIds, paymentMethod, discount, cashReceived, expectedAmount, selections, versions, requestId }) { return (await authenticatedApiRequest('/api/v1/cashier/payments', { method: 'POST', body: { orderIds, paymentMethod, discount, cashReceived, expectedAmount, selections, versions, requestId } })).payment }
export async function getSupabasePaymentRequest(requestId) { return (await authenticatedApiRequest(`/api/v1/cashier/payment-requests/${encodeURIComponent(requestId)}`)).payment }
export async function getSupabaseReceiptRefunds(receiptNumber) { return authenticatedApiRequest(`/api/v1/cashier/receipts/${encodeURIComponent(receiptNumber)}/refunds`) }
export async function getSupabaseRefundEvents() { return authenticatedApiRequest('/api/v1/admin/refund-events') }
export async function getSupabasePaidReceipts() { return (await authenticatedApiRequest('/api/v1/cashier/receipts')).receipts }
export async function recordSupabaseRefund(receiptNumber, body) { return (await authenticatedApiRequest(`/api/v1/admin/receipts/${encodeURIComponent(receiptNumber)}/refunds`, { method: 'POST', body })).refund }
export function subscribeToSupabasePendingPayments(onData, onError) { return poll(async () => authenticatedApiRequest('/api/v1/cashier/pending-orders'), onData, onError, 5000) }
export function watchSupabasePendingPayments(onData, onError) { return watchPoll((signal) => authenticatedApiRequest('/api/v1/cashier/pending-orders', { signal }), onData, onError, { interval: 5000 }) }
export async function getSupabaseCashierOrderSetup() { return authenticatedApiRequest('/api/v1/cashier/order-setup') }
export async function createSupabaseCashierOrder({ tableId, isWalkIn, expectedTableSessionId, customerNickname, items, requestId, settingsRevision, orderType, ticketSeat, ticketReference }) {
  return authenticatedApiRequest('/api/v1/cashier/orders', {
    method: 'POST',
    body: { tableId, ...(isWalkIn === true ? { isWalkIn: true } : {}), expectedTableSessionId, customerNickname, items, settingsRevision, orderType, ...(ticketSeat ? {ticketSeat} : {}), ...(ticketReference ? {ticketReference} : {}) },
    headers: { 'Idempotency-Key': requestId },
  })
}

export async function getOrderIdentifiers(id) { return (await authenticatedApiRequest(`/api/v1/operations/orders/${encodeURIComponent(id)}/identifiers`)).order }
export async function saveOrderIdentifiers(id, body) { return (await authenticatedApiRequest(`/api/v1/operations/orders/${encodeURIComponent(id)}/identifiers`,{method:'PATCH',body})).order }
export async function getTableVisits() { return (await authenticatedApiRequest('/api/v1/cashier/table-visits')).tables }
export async function moveTableVisit(body) { return (await authenticatedApiRequest('/api/v1/cashier/table-visits/move',{method:'POST',body})).result }
export async function getWalkInAssignmentTables(sessionId) { return authenticatedApiRequest(`/api/v1/cashier/walk-in-visits/${encodeURIComponent(sessionId)}/tables`) }
export async function assignWalkInTable(body) { return (await authenticatedApiRequest('/api/v1/cashier/walk-in-visits/assign-table', { method: 'POST', body })).result }
export async function saveSupabaseCashierTableLayout(positions, plan = {}) { return authenticatedApiRequest('/api/v1/cashier/table-layout', { method: 'PATCH', body: { positions, ...plan } }) }
export function subscribeToSupabaseReceipts(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/cashier/receipts')).receipts.map((receipt) => ({ ...receipt, grandTotal: receipt.amount })), onData, onError, 15000) }
export function subscribeToSupabaseReceipt(receiptNumber, onData, onError) { return poll(async () => { const receipt = (await authenticatedApiRequest(`/api/v1/cashier/receipts/${encodeURIComponent(receiptNumber)}`)).receipt; return { ...receipt, grandTotal: receipt.amount, cashierId: receipt.cashierName } }, onData, onError, 15000) }
export async function reprintSupabaseReceipt(receiptNumber) { await authenticatedApiRequest(`/api/v1/cashier/receipts/${encodeURIComponent(receiptNumber)}/reprint`, { method: 'POST' }) }
export function subscribeToSupabaseSettlement(onData, onError) { return poll(async () => authenticatedApiRequest('/api/v1/cashier/settlement'), onData, onError, 10000) }
export async function createSupabaseShiftClosing() { return (await authenticatedApiRequest('/api/v1/cashier/shift-closings', { method: 'POST', body: {} })).closing }
export function subscribeToSupabaseShiftClosing(closingId, onData, onError) { return poll(async () => (await authenticatedApiRequest(`/api/v1/cashier/shift-closings/${encodeURIComponent(closingId)}`)).closing, onData, onError, 15000) }
