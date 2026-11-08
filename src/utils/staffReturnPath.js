export function staffReturnPath(role, requested) {
  const fallback = { admin: '/admin/dashboard', cashier: '/cashier', kitchen: '/kitchen', staff: '/staff' }[role] ?? '/'
  if (typeof requested !== 'string' || !requested.startsWith('/') || requested.startsWith('//') || requested.includes('\\')) return fallback
  const path = requested.split(/[?#]/)[0]
  const roots = role === 'admin' ? ['admin', 'cashier', 'kitchen', 'staff'] : [role]
  return roots.some((root) => path === '/' + root || path.startsWith('/' + root + '/')) && path !== '/admin/login' ? requested : fallback
}
