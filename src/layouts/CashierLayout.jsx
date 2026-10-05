import PortalLayout from '../components/common/PortalLayout'
import useAdminAuth from '../hooks/useAdminAuth'

const cashierNavigation = [
  { end: true, label: 'Dashboard', to: '/cashier' },
  { label: 'New order', to: '/cashier/new-order' },
  { label: 'Receipt history', to: '/cashier/history' },
  { label: 'Shift closing', to: '/cashier/closing' },
]

function CashierLayout() {
  const { authUser } = useAdminAuth()
  const navigation = authUser?.role === 'admin'
    ? [{ label: '← Back to Admin', to: '/admin/dashboard' }, ...cashierNavigation]
    : cashierNavigation

  return <PortalLayout area="Cashier" navigation={navigation} />
}

export default CashierLayout
