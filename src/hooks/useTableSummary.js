import { useEffect, useMemo, useState } from 'react'
import useCustomerSession from './useCustomerSession'
import { subscribeToTableOrders } from '../services/tableSummaryService'

function getParticipantStatus(orders) {
  if (orders.length === 0) return 'No orders yet'
  return String(orders[0].status ?? 'received')
}

function sumOrderField(orders, field) {
  return orders.reduce((total, order) => total + Number(order[field] ?? 0), 0)
}

function useTableSummary() {
  const { session, sessionError, tableSession } = useCustomerSession()
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(Boolean(session?.tableNumber))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session?.tableNumber) {
      setOrders([])
      setIsLoading(false)
      return () => {}
    }

    setIsLoading(true)
    return subscribeToTableOrders(
      session.tableNumber,
      (tableOrders) => {
        setOrders(tableOrders)
        setError('')
        setIsLoading(false)
      },
      (firebaseError) => {
        console.error('[Table Summary] Failed to load table orders:', firebaseError)
        setError('We could not load your table summary right now. Please try again shortly.')
        setIsLoading(false)
      },
    )
  }, [session?.tableNumber])

  const participants = useMemo(() => {
    const tableParticipants = Array.isArray(tableSession?.participants) ? tableSession.participants : []
    return tableParticipants.map((participant) => {
      const participantOrders = orders.filter((order) => order.sessionId === participant.sessionId)
      return {
        ...participant,
        orders: participantOrders,
        status: getParticipantStatus(participantOrders),
        subtotal: sumOrderField(participantOrders, 'subtotal'),
        serviceCharge: sumOrderField(participantOrders, 'serviceCharge'),
        sst: sumOrderField(participantOrders, 'sst'),
        grandTotal: sumOrderField(participantOrders, 'grandTotal'),
        paymentStatus: 'pending',
      }
    })
  }, [orders, tableSession?.participants])

  const grandTotal = useMemo(
    () => participants.reduce((total, participant) => total + participant.grandTotal, 0),
    [participants],
  )

  return { participants, grandTotal, tableNumber: session?.tableNumber, currentSessionId: session?.sessionId, hasSession: Boolean(session), hasTableSession: tableSession?.status === 'active', isLoading, error: error || sessionError }
}

export default useTableSummary
