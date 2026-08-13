import { useEffect, useMemo, useState } from 'react'
import { subscribeToSupabaseSettlement } from '../services/adminApiService'

const methodKeys = {
  Cash: 'cash',
  'Credit/Debit Card': 'card',
  "Touch 'n Go": 'touchNGo',
  GrabPay: 'grabPay',
  FPX: 'fpx',
  Other: 'other',
}

function useShiftClosing() {
  const [orders, setOrders] = useState([])
  const [todayOrders, setTodayOrders] = useState([])
  const [closings, setClosings] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const onError = (apiError) => {
      console.error('[Shift Closing] API query failed:', apiError)
      setError('We could not load settlement data. Please try again shortly.')
      setIsLoading(false)
    }
    return subscribeToSupabaseSettlement((data) => {
      setOrders(data.paidPayments.map((payment) => ({ ...payment, grandTotal: payment.amount })))
      setTodayOrders(data.todayOrders)
      setClosings(data.closings.map((closing) => ({ ...closing, ...(closing.summary ?? {}) })))
      setIsLoading(false)
    }, onError)
  }, [])

  const summary = useMemo(() => {
    const breakdown = { cash: 0, card: 0, touchNGo: 0, grabPay: 0, fpx: 0, other: 0 }
    const counts = { cash: 0, card: 0, touchNGo: 0, grabPay: 0, fpx: 0, other: 0 }
    orders.forEach((order) => {
      const key = methodKeys[order.paymentMethod] ?? 'other'
      breakdown[key] += Number(order.grandTotal) || 0
      counts[key] += 1
    })
    const grandTotal = Object.values(breakdown).reduce((sum, amount) => sum + amount, 0)
    const transactionCount = orders.length
    const bills = orders.map((order) => Number(order.grandTotal) || 0)
    return {
      ...breakdown,
      counts,
      grandTotal,
      transactionCount,
      totalPaidOrders: transactionCount,
      pendingPayments: todayOrders.filter((order) => String(order.status).toLowerCase() === 'served' && String(order.paymentStatus ?? 'pending').toLowerCase() !== 'paid').length,
      cancelledOrders: todayOrders.filter((order) => ['cancelled', 'canceled'].includes(String(order.status).toLowerCase())).length,
      averageBill: transactionCount ? grandTotal / transactionCount : 0,
      highestBill: bills.length ? Math.max(...bills) : 0,
      lowestBill: bills.length ? Math.min(...bills) : 0,
    }
  }, [orders, todayOrders])

  return { closings, error, isLoading, orders, summary }
}

export default useShiftClosing
