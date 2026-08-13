import { authenticatedApiRequest } from './supabaseAuthService'

function poll(load, onData, onError, interval = 10000) {
  let active = true
  const refresh = async () => {
    try {
      const result = await load()
      if (active) onData(result)
    } catch (error) {
      if (active) onError?.(error)
    }
  }
  void refresh()
  const timer = window.setInterval(() => { void refresh() }, interval)
  return () => { active = false; window.clearInterval(timer) }
}

export function subscribeToSupabaseAdminOrders(onData, onError) {
  return poll(async () => (await authenticatedApiRequest('/api/v1/admin/orders')).orders, onData, onError)
}

export async function cancelSupabaseAdminOrder(orderId) {
  return (await authenticatedApiRequest(`/api/v1/admin/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'PATCH' })).order
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
export async function clearSupabaseCashierTable(id) { return authenticatedApiRequest(`/api/v1/admin/tables/${encodeURIComponent(id)}/clear`, { method: 'POST' }) }

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
    const [orders, requests, menu, categories, tables] = await Promise.all([
      authenticatedApiRequest('/api/v1/admin/orders'),
      authenticatedApiRequest('/api/v1/staff/service-requests'),
      authenticatedApiRequest('/api/v1/admin/menu-items'),
      authenticatedApiRequest('/api/v1/admin/categories'),
      authenticatedApiRequest('/api/v1/admin/tables'),
    ])
    return { orders: orders.orders, requests: requests.requests, menuItems: menu.items, categories: categories.categories.map((category) => ({ ...category, isActive: category.isEnabled })), tables: tables.tables.map((table) => ({ ...table, isActive: table.isEnabled })) }
  }, onData, onError, 15000)
}
export function subscribeToSupabaseMembers(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/admin/members')).members, onData, onError, 15000) }
export function subscribeToSupabaseMemberPoints(memberId, onData, onError) { return poll(async () => (await authenticatedApiRequest(`/api/v1/admin/members/${encodeURIComponent(memberId)}/points`)).transactions, onData, onError, 15000) }
export function subscribeToSupabaseRewards(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/admin/rewards')).rewards, onData, onError, 15000) }
export async function saveSupabaseReward(input, id = '') { return (await authenticatedApiRequest(id ? `/api/v1/admin/rewards/${encodeURIComponent(id)}` : '/api/v1/admin/rewards', { method: id ? 'PATCH' : 'POST', body: input })).reward }
export async function getSupabaseKitchenOrders() { return (await authenticatedApiRequest('/api/v1/kitchen/orders')).orders }
export function subscribeToSupabaseKitchenOrders(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/kitchen/orders')).orders, onData, onError, 5000) }
export async function updateSupabaseKitchenOrderStatus(orderId, status, expectedStatus) { return (await authenticatedApiRequest(`/api/v1/kitchen/orders/${encodeURIComponent(orderId)}/status`, { method: 'PATCH', body: { status, expectedStatus } })).order }
export async function getSupabaseServiceRequests() { return (await authenticatedApiRequest('/api/v1/staff/service-requests')).requests }
export function subscribeToSupabaseServiceRequests(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/staff/service-requests')).requests, onData, onError, 5000) }
export async function completeSupabaseServiceRequest(requestId) { return (await authenticatedApiRequest(`/api/v1/staff/service-requests/${encodeURIComponent(requestId)}/complete`, { method: 'PATCH' })).request }
export async function findSupabaseCashierMember(identifier) { return (await authenticatedApiRequest(`/api/v1/cashier/members/${encodeURIComponent(identifier)}`)).member }
export function subscribeToSupabaseCashierRewards(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/cashier/rewards')).rewards, onData, onError, 15000) }
export async function redeemSupabaseCashierReward(memberId, rewardId) { return (await authenticatedApiRequest(`/api/v1/cashier/rewards/${encodeURIComponent(rewardId)}/redeem`, { method: 'POST', body: { memberId } })).redemption }
export async function completeSupabaseTablePayment({ orderIds, paymentMethod, discount }) { return (await authenticatedApiRequest('/api/v1/cashier/payments', { method: 'POST', body: { orderIds, paymentMethod, discount } })).payment }
export function subscribeToSupabasePendingPayments(onData, onError) { return poll(async () => authenticatedApiRequest('/api/v1/cashier/pending-orders'), onData, onError, 5000) }
export function subscribeToSupabaseReceipts(onData, onError) { return poll(async () => (await authenticatedApiRequest('/api/v1/cashier/receipts')).receipts.map((receipt) => ({ ...receipt, grandTotal: receipt.amount })), onData, onError, 15000) }
export function subscribeToSupabaseReceipt(receiptNumber, onData, onError) { return poll(async () => { const receipt = (await authenticatedApiRequest(`/api/v1/cashier/receipts/${encodeURIComponent(receiptNumber)}`)).receipt; return { ...receipt, grandTotal: receipt.amount, cashierId: receipt.cashierName } }, onData, onError, 15000) }
export async function reprintSupabaseReceipt(receiptNumber) { await authenticatedApiRequest(`/api/v1/cashier/receipts/${encodeURIComponent(receiptNumber)}/reprint`, { method: 'POST' }) }
export function subscribeToSupabaseSettlement(onData, onError) { return poll(async () => authenticatedApiRequest('/api/v1/cashier/settlement'), onData, onError, 10000) }
export async function createSupabaseShiftClosing() { return (await authenticatedApiRequest('/api/v1/cashier/shift-closings', { method: 'POST', body: {} })).closing }
export function subscribeToSupabaseShiftClosing(closingId, onData, onError) { return poll(async () => (await authenticatedApiRequest(`/api/v1/cashier/shift-closings/${encodeURIComponent(closingId)}`)).closing, onData, onError, 15000) }
