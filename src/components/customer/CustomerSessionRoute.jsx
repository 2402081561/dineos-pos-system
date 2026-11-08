import { Navigate, Outlet, useLocation } from 'react-router-dom'
import useCustomerSession from '../../hooks/useCustomerSession'
import StatePanel from '../common/StatePanel'

function CustomerSessionRoute() {
  const { session, sessionError, isRestoring, restoreError, retryRestore } = useCustomerSession()
  const location = useLocation()

  if (isRestoring) return <StatePanel title="Restoring your table..." description={restoreError || 'Checking your table session. Your cart will be restored shortly.'} tone={restoreError ? 'error' : 'neutral'} onRetry={retryRestore} />
  if (session?.isTakeawayQr && ['/table-summary','/bill','/service-requests','/member','/rewards','/more'].includes(location.pathname)) return <Navigate replace to="/orders" />
  return session ? <Outlet /> : <Navigate replace state={{ from: location.pathname }} to={sessionError === 'Your take-away visit has ended. Open the take-away page to start again.'?'/takeaway':'/join'} />
}

export default CustomerSessionRoute
