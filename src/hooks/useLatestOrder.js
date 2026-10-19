import useCustomerOrders from './useCustomerOrders'

function useLatestOrder() {
  const { orders, isLoading, error } = useCustomerOrders()
  return { order: orders[0] ?? null, orders, isLoading, error }
}

export default useLatestOrder
