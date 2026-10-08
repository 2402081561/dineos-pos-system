import { useEffect, useMemo, useState } from 'react'
import useCustomerSession from './useCustomerSession'
import { getCustomerOrders, getCustomerTableSummary } from '../services/customerApi'
import { ordersForParticipant } from '../utils/customerOrder'

function getParticipantStatus(orders) {
  if (orders.length === 0) return 'No orders yet'
  return String(orders[0].status ?? 'received')
}

function sumOrderField(orders, field) {
  return orders.reduce((total, order) => total + Number(order[field] ?? 0), 0)
}

function useTableSummary() {
  const { session, sessionError } = useCustomerSession()
  const [orders, setOrders] = useState([])
  const [summaryParticipants, setSummaryParticipants] = useState([])
  const [paymentStatus, setPaymentStatus] = useState('no_orders')
  const [isLoading, setIsLoading] = useState(Boolean(session?.tableNumber))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session?.sessionId) {
      setOrders([])
      setIsLoading(false)
      return () => {}
    }

    let active = true
    const load = async () => {
      try {
        const [summary, ownOrders] = await Promise.all([getCustomerTableSummary(session.sessionId), getCustomerOrders(session.sessionId)])
        if (!active) return
        setSummaryParticipants(summary.participants.map((participant) => ({ sessionId: participant.isCurrentCustomer ? session.sessionId : participant.id, customerNickname: participant.customerNickname, ...participant })))
        setOrders(ownOrders.filter((order) => order.paymentStatus !== 'paid' && order.status !== 'cancelled'))
        setPaymentStatus(summary.paymentStatus ?? 'no_orders')
        setError('')
      } catch { if (active) setError('We could not load your table summary right now. Please try again shortly.') } finally { if (active) setIsLoading(false) }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 10000)
    return () => { active = false; window.clearInterval(timer) }
  }, [session?.sessionId])

  const participants = useMemo(() => {
    const tableParticipants = summaryParticipants
    return tableParticipants.map((participant) => {
      const participantOrders = ordersForParticipant(orders, participant)
      return {
        ...participant,
        orders: participantOrders,
        status: participant.isCurrentCustomer || participant.isCounterOrder ? getParticipantStatus(participantOrders) : participant.status,
        subtotal: Number(participant.subtotal ?? sumOrderField(participantOrders, 'subtotal')),
        serviceCharge: Number(participant.serviceCharge ?? sumOrderField(participantOrders, 'serviceCharge')),
        sst: Number(participant.sst ?? sumOrderField(participantOrders, 'sst')),
        grandTotal: Number(participant.grandTotal ?? sumOrderField(participantOrders, 'grandTotal')),
        paymentStatus: participant.paymentStatus ?? 'pending',
      }
    })
  }, [orders, summaryParticipants])

  const grandTotal = useMemo(
    () => participants.reduce((total, participant) => total + participant.grandTotal, 0),
    [participants],
  )

  return { participants, grandTotal, paymentStatus, tableNumber: session?.tableNumber, currentSessionId: session?.sessionId, hasSession: Boolean(session), hasTableSession: Boolean(session), isLoading, error: error || sessionError }
}

export default useTableSummary
