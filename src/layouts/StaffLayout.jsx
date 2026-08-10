import PortalLayout from '../components/common/PortalLayout'

const navigation = [
  { end: true, label: 'Dashboard', to: '/staff' },
  { label: 'Requests', to: '/staff/requests' },
  { label: 'Tables', to: '/staff/tables' },
]

function StaffLayout() {
  return <PortalLayout area="Staff" navigation={navigation} />
}

export default StaffLayout
