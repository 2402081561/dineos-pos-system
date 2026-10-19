import PortalLayout from '../components/common/PortalLayout'
import useAdminAuth from '../hooks/useAdminAuth'
import { useLocation } from 'react-router-dom'

const cashierNavigation = [
  { end: true, label: 'Dashboard', to: '/cashier' },
  { label: 'New order', to: '/cashier/new-order' },
  { label: 'Receipt history', to: '/cashier/history' },
  { label: 'Shift closing', to: '/cashier/closing' },
]

function CashierLayout() {
  const { authUser } = useAdminAuth()
  const { pathname } = useLocation()
  const navigation = authUser?.role === 'admin'
    ? [{ label: '← Back to Admin', to: '/admin/dashboard' }, ...cashierNavigation]
    : cashierNavigation

  return <PortalLayout area="Cashier" navigation={navigation} wideWorkspace={pathname === '/cashier' || pathname === '/cashier/new-order'} subdued={pathname === '/cashier'} />
}

export default CashierLayout
