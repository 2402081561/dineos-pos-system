import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import Button from '../../components/common/Button'
import { signInAdmin } from '../../services/authService'

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()

    try {
      setIsLoading(true)
      setError('')
      await signInAdmin(email, password)
      navigate(location.state?.from ?? '/admin/dashboard', { replace: true })
    } catch (firebaseError) {
      console.error('[Admin Login] Firebase sign-in failed:', firebaseError)
      setError('Unable to sign in. Please check your email and password.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      <div className="w-full max-w-md">
        <Link className="mb-6 inline-block text-sm font-medium text-orange-300" to="/">
          ← Back to DineOS
        </Link>
        <form className="rounded-3xl bg-white p-7 shadow-2xl sm:p-9" onSubmit={handleSubmit}><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600 text-xl text-white">⌁</div><p className="eyebrow mt-7">DineOS Control Centre</p><h1 className="mt-1 text-3xl font-bold">Welcome back</h1><p className="mt-3 text-sm text-slate-500">Sign in to manage your restaurant.</p><label className="mt-7 block text-sm font-bold" htmlFor="email">Email address</label><input className="mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-orange-400" id="email" onChange={(event) => setEmail(event.target.value)} placeholder="admin@dineos.com" required type="email" value={email} /><label className="mt-5 block text-sm font-bold" htmlFor="password">Password</label><input className="mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-orange-400" id="password" onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required type="password" value={password} />{error && <p className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}<Button className="mt-6 w-full py-3" disabled={isLoading} type="submit">{isLoading ? 'Signing in...' : 'Sign in'}</Button></form>
      </div>
    </main>
  )
}

export default Login
