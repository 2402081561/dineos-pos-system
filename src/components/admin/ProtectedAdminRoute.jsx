import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { Navigate, useLocation } from 'react-router-dom'
import useAdminAuth from '../../hooks/useAdminAuth'

function ProtectedAdminRoute({ children }) {
  const { t: uiText } = useCustomerLanguage()

  const { adminUser, isLoading } = useAdminAuth()
  const location = useLocation()

  if (isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50"><div className="rounded-2xl bg-white px-6 py-5 text-sm font-semibold text-slate-500 shadow-sm">{uiText("Checking administrator access…")}</div></main>
  }

  return adminUser ? children : <Navigate replace state={{ from: location.pathname }} to="/admin/login" />
}

export default ProtectedAdminRoute
