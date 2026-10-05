import PortalLayout from '../components/common/PortalLayout'

function CashierLayout() {
  return <PortalLayout area="Cashier" navigation={[{ end: true, label: 'Dashboard', to: '/cashier' }, { label: 'New order', to: '/cashier/new-order' }, { label: 'Receipt history', to: '/cashier/history' }, { label: 'Shift closing', to: '/cashier/closing' }]} />
}

export default CashierLayout
