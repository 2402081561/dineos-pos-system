import { Navigate, useLocation } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'

function ProtectedCashierRoute({ children }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <main className="flex min-h-screen items-center justify-center bg-slate-50"><div className="rounded-2xl bg-white px-6 py-5 text-sm font-semibold text-slate-500 shadow-sm">Checking cashier access…</div></main>
  return user ? children : <Navigate replace state={{ from: location.pathname }} to="/admin/login" />
}

export default ProtectedCashierRoute
