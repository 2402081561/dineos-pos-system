import { Navigate } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'

function ProtectedAdminRoute({ children }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50"><div className="rounded-2xl bg-white px-6 py-5 text-sm font-semibold text-slate-500 shadow-sm">Checking administrator access…</div></main>
  }

  return user ? children : <Navigate replace to="/admin/login" />
}

export default ProtectedAdminRoute
