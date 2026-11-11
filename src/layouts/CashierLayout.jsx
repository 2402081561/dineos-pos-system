import PortalLayout from '../components/common/PortalLayout'
import useAdminAuth from '../hooks/useAdminAuth'
import { useLocation } from 'react-router-dom'

const cashierNavigation = [
  { label: 'New order', to: '/cashier/new-order' },
  { end: true, label: 'Dashboard', to: '/cashier' },
  { label: 'Receipt history', to: '/cashier/history' },
  { label: 'Shift closing', to: '/cashier/closing' },
  { label: 'Order notifications', to: '/cashier/notifications' },
]

function CashierLayout() {
  const { authUser } = useAdminAuth()
  const { pathname } = useLocation()
  const navigation = authUser?.role === 'admin'
    ? [{ label: '← Back to Admin', to: '/admin/dashboard' }, ...cashierNavigation]
    : cashierNavigation

  return <PortalLayout area="Cashier" navigation={navigation} wideWorkspace={pathname === '/cashier' || pathname === '/cashier/new-order'} containedWorkspace={pathname === '/cashier/new-order'} subdued={pathname === '/cashier'} />
}

export default CashierLayout
