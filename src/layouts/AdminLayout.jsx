import PortalLayout from '../components/common/PortalLayout'

const navigation = [
  { label: 'Dashboard', to: '/admin/dashboard' },
  { label: 'Menu', to: '/admin/menu' },
  { label: 'Categories', to: '/admin/categories' },
  { label: 'Tables', to: '/admin/tables' },
  { label: 'Orders', to: '/admin/orders' },
  { label: 'Reports', to: '/admin/reports' },
  { label: 'Members', to: '/admin/members' },
  { label: 'Rewards', to: '/admin/rewards' },
  { label: 'Audit log', to: '/admin/audit-log' },
  { label: 'Shop settings', to: '/admin/settings' },
]

function AdminLayout() {
  return <PortalLayout area="Admin" navigation={navigation} />
}

export default AdminLayout
