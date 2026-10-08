const apiUrl = String(import.meta.env.VITE_API_URL ?? 'http://localhost:4000').trim().replace(/\/$/, '')

async function request(path, { body, method = 'GET', sessionId, idempotencyKey, signal } = {}) {
  const response = await fetch(`${apiUrl}${path}`, { method, signal, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(sessionId ? { 'X-Customer-Session': sessionId } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'The server could not complete this request.')
  return data
}

export async function joinCustomerTable(tableNumber, customerNickname = 'Guest') { return (await request(`/api/v1/public/tables/${encodeURIComponent(tableNumber)}/join`, { method: 'POST', body: { customerNickname } })).session }
export async function getCustomerSession(sessionId) { return (await request('/api/v1/public/customer-session', { sessionId })).session }
export async function updateCustomerNickname(sessionId, customerNickname) { return (await request('/api/v1/public/customer-session', { method: 'PATCH', sessionId, body: { customerNickname } })).session }
export async function leaveCustomerSession(sessionId) { await request('/api/v1/public/customer-session/leave', { method: 'POST', sessionId }) }
export async function getPublicMenu() { return (await request('/api/v1/public/menu')).items }
export async function getPreparationEstimate(quantity, signal) { return (await request(`/api/v1/public/preparation-estimate?quantity=${encodeURIComponent(quantity)}`, { signal })).estimate }
export async function placeCustomerOrder(sessionId, items, requestId = crypto.randomUUID(), settingsRevision, orderType) { return (await request('/api/v1/public/orders', { method: 'POST', sessionId, idempotencyKey: requestId, body: { items, settingsRevision, orderType } })).order }
export async function getCustomerOrders(sessionId) { return (await request('/api/v1/public/orders', { sessionId })).orders }
export async function cancelCustomerOrder(sessionId, orderId) { return (await request(`/api/v1/public/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'PATCH', sessionId })).order }
export async function getCustomerTableSummary(sessionId) { return request('/api/v1/public/table-summary', { sessionId }) }
export async function getPublicMember(sessionId) { return (await request('/api/v1/public/member', { sessionId })).member }
export async function getPublicPoints(sessionId) { return (await request('/api/v1/public/points', { sessionId })).transactions }
export async function getPublicRewards(sessionId) { return (await request('/api/v1/public/rewards', { sessionId })).rewards }
export async function redeemPublicReward(sessionId, rewardId) { return (await request(`/api/v1/public/rewards/${encodeURIComponent(rewardId)}/redeem`, { method: 'POST', sessionId })).redemption }
export async function createCustomerMember(sessionId, form) { return request('/api/v1/public/members', { method: 'POST', sessionId, body: form }) }
export async function loginCustomerMember(sessionId, credentials) { return request('/api/v1/public/members/login', { method: 'POST', sessionId, body: credentials }) }
export async function createCustomerServiceRequest(sessionId, requestType, details = {}) { return request('/api/v1/public/service-requests', { method: 'POST', sessionId, body: { requestType, ...details } }) }
