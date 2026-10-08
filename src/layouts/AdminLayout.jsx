import PortalLayout from '../components/common/PortalLayout'

import navigation from '../utils/adminNavigation'

function AdminLayout() {
  return <PortalLayout area="Admin" navigation={navigation} subdued />
}

export default AdminLayout
