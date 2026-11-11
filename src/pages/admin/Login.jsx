import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import useShopSettings from '../../hooks/useShopSettings'
import LanguageSwitch from '../../components/customer/LanguageSwitch'
import Button from '../../components/common/Button'
import useAdminAuth from '../../hooks/useAdminAuth'
import BrandMark from '../../components/common/BrandMark'
import { staffReturnPath } from '../../utils/staffReturnPath'
import usePortalTheme from '../../hooks/usePortalTheme'
import PortalThemeToggle from '../../components/common/PortalThemeToggle'

function Login() {
  const { t: uiText } = useCustomerLanguage()
  const { theme, toggleTheme } = usePortalTheme()

  const { name } = useShopSettings()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState('')
  const { signIn } = useAdminAuth()

  async function handleSubmit(event) {
    event.preventDefault()

    try {
      setIsLoading(true)
      setIsVerifying(false)
      setError('')
      const requested = location.state?.from
      const role = (await signIn(email, password, { onVerifying: () => setIsVerifying(true) })).role
      navigate(staffReturnPath(role, requested), { replace: true })
    } catch (signInError) {
      console.error('[Admin Login] Supabase sign-in failed:', signInError)
      setError(signInError instanceof Error ? signInError.message : 'Unable to sign in. Please check your email and password.')
    } finally {
      setIsLoading(false)
      setIsVerifying(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      <div className="w-full max-w-md"><div className="mb-4 flex justify-end gap-2"><PortalThemeToggle theme={theme} onToggle={toggleTheme} /><LanguageSwitch /></div>
        <Link className="mb-6 inline-block text-sm font-medium text-orange-300" to="/">{uiText("← Back to")}{' '}{name}
        </Link>
        {isLoading && isVerifying && <div className="mb-4 rounded-xl border border-orange-300/30 bg-slate-900 p-4 text-sm text-orange-100" role="status"><p className="font-semibold">{uiText('Connecting to restaurant...')}</p><p className="mt-1">{uiText('The first connection may take about a minute. Please keep this page open and do not submit again.')}</p></div>}
        <form className="rounded-3xl bg-white p-7 shadow-2xl sm:p-9" onSubmit={handleSubmit}><BrandMark className="h-14 w-14" /><p className="eyebrow mt-7">{name}{' '}{uiText("· Control Centre")}</p><h1 className="mt-1 text-3xl font-bold">{uiText("Welcome back")}</h1><p className="mt-3 text-sm text-slate-500">{uiText("Sign in to manage your restaurant.")}</p><label className="mt-7 block text-sm font-bold" htmlFor="email">{uiText("Email address")}</label><input className="mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-orange-400" id="email" onChange={(event) => setEmail(event.target.value)} placeholder={uiText("admin@dineos.com")} required type="email" value={email} /><label className="mt-5 block text-sm font-bold" htmlFor="password">{uiText("Password")}</label><input className="mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-orange-400" id="password" onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required type="password" value={password} />{error && <p className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{uiText(error)}</p>}<Button className="mt-6 w-full py-3" disabled={isLoading} type="submit">{isLoading ? uiText("Signing in...") : uiText("Sign in")}</Button></form>
      </div>
    </main>
  )
}

export default Login
