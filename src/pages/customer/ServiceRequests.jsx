import { Navigate } from 'react-router-dom'

// Customer service actions are paused. Keep old bookmarks safe; staff history
// and existing request records remain available in the employee portal.
export default function ServiceRequests() {
  return <Navigate replace to="/more" />
}
