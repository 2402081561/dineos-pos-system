import PortalLayout from '../components/common/PortalLayout'

import navigation from '../utils/adminNavigation'
import AdminMobileNavigation from '../components/admin/AdminMobileNavigation'

function AdminLayout() {
  return <PortalLayout area="Admin" navigation={navigation} collapsibleNavigation fixedMobileNavigation mobileNavigation={<AdminMobileNavigation />} subdued />
}

export default AdminLayout
