const adminNavigation = [
  { label: 'Dashboard', to: '/admin/dashboard' },
  { label: 'Cashier', to: '/cashier', group: 'Daily work' },
  { label: 'Kitchen', to: '/admin/kitchen', group: 'Daily work' },
  { label: 'Orders', to: '/admin/orders', group: 'Daily work' },
  { label: 'Tables', to: '/admin/tables', group: 'Daily work' },
  { label: 'Reports', to: '/admin/reports', group: 'Daily work' },
  { label: 'Refund records', to: '/admin/refunds', group: 'Daily work' },
  { label: 'Menu', to: '/admin/menu', group: 'Menu & customers' },
  { label: 'Categories', to: '/admin/categories', group: 'Menu & customers' },
  { label: 'Members', to: '/admin/members', group: 'Menu & customers' },
  { label: 'Rewards', to: '/admin/rewards', group: 'Menu & customers' },
  { label: 'Audit log', to: '/admin/audit-log', group: 'Shop management' },
  { label: 'Shop settings', to: '/admin/settings', group: 'Shop management' },
  { label: 'Order notifications', to: '/cashier/notifications', group: 'Shop management' },
]
export default adminNavigation
