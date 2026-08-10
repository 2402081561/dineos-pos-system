import PortalLayout from '../components/common/PortalLayout'

const navigation = [
  { label: 'Dashboard', to: '/admin/dashboard' },
  { label: 'Menu', to: '/admin/menu' },
  { label: 'Categories', to: '/admin/categories' },
  { label: 'Tables', to: '/admin/tables' },
  { label: 'Orders', to: '/admin/orders' },
  { label: 'Reports', to: '/admin/reports' },
]

function AdminLayout() {
  return <PortalLayout area="Admin" navigation={navigation} />
}

export default AdminLayout
