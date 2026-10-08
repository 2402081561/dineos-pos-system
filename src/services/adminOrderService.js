import { cancelSupabaseAdminOrder, subscribeToSupabaseAdminOrders } from './adminApiService'

export function subscribeToAdminOrders(onOrdersUpdate, onError) {
  return subscribeToSupabaseAdminOrders(onOrdersUpdate, onError)
}

export async function cancelOrder(orderId, reason, expectedVersion) {
  return cancelSupabaseAdminOrder(orderId, reason, expectedVersion)
}
