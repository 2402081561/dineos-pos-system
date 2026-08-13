import ProtectedRoleRoute from '../auth/ProtectedRoleRoute'

function ProtectedCashierRoute({ children }) {
  return <ProtectedRoleRoute roles={['admin', 'cashier']}>{children}</ProtectedRoleRoute>
}

export default ProtectedCashierRoute
