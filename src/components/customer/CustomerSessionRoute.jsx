import { Navigate, Outlet, useLocation } from 'react-router-dom'
import useCustomerSession from '../../hooks/useCustomerSession'

function CustomerSessionRoute() {
  const { session } = useCustomerSession()
  const location = useLocation()

  return session ? <Outlet /> : <Navigate replace state={{ from: location.pathname }} to="/join" />
}

export default CustomerSessionRoute
