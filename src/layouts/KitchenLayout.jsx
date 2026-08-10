import PortalLayout from '../components/common/PortalLayout'

const navigation = [{ label: 'Dashboard', to: '/kitchen' }]

function KitchenLayout() {
  return <PortalLayout area="Kitchen" navigation={navigation} />
}

export default KitchenLayout
