import { Navigate, Outlet, useLocation } from 'react-router-dom'
import useCustomerSession from '../../hooks/useCustomerSession'
import StatePanel from '../common/StatePanel'

function CustomerSessionRoute() {
  const { session, isRestoring, restoreError, retryRestore } = useCustomerSession()
  const location = useLocation()

  if (isRestoring) return <StatePanel title="Restoring your table..." description={restoreError || 'Checking your table session. Your cart will be restored shortly.'} tone={restoreError ? 'error' : 'neutral'} onRetry={retryRestore} />
  return session ? <Outlet /> : <Navigate replace state={{ from: location.pathname }} to="/join" />
}

export default CustomerSessionRoute
