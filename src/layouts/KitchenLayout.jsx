import PortalLayout from '../components/common/PortalLayout'
import useAdminAuth from '../hooks/useAdminAuth'

const navigation = [{ end: true, label: 'Dashboard', to: '/kitchen' }, { label: 'Account settings', to: '/kitchen/account-settings' }]

function KitchenLayout() {
  const { authUser } = useAdminAuth()
  const kitchenNavigation = authUser?.role === 'admin'
    ? [{ label: '← Back to Admin', to: '/admin/dashboard' }, ...navigation]
    : navigation
  return <PortalLayout area="Kitchen" navigation={kitchenNavigation} />
}

export default KitchenLayout
