import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { Navigate, useLocation } from 'react-router-dom'
import useAdminAuth from '../../hooks/useAdminAuth'

function ProtectedAdminRoute({ children }) {
  const { t: uiText } = useCustomerLanguage()

  const { adminUser, authUser, authError, isLoading } = useAdminAuth()
  const location = useLocation()

  if (isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50"><div className="rounded-2xl bg-white px-6 py-5 text-sm font-semibold text-slate-500 shadow-sm">{uiText("Checking administrator access…")}</div></main>
  }

  if (!authUser && authError) return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><p role="status" className="max-w-lg rounded-xl border border-amber-200 bg-white p-5 text-sm">{uiText(authError)}</p></main>
  return adminUser ? children : <Navigate replace state={{ from: location.pathname }} to="/admin/login" />
}

export default ProtectedAdminRoute
