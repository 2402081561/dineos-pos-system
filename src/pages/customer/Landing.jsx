import useShopSettings from '../../hooks/useShopSettings'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { Link } from 'react-router-dom'
import Button from '../../components/common/Button'
import useCustomerSession from '../../hooks/useCustomerSession'

function Landing() {
  const { t } = useCustomerLanguage()
  const { name: shopName } = useShopSettings()
  const { session } = useCustomerSession()
  const tableLabel = session ? t('Table {{number}}', { number: session.tableNumber }) : t('Scan table QR to begin')

  return <div className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-2xl shadow-slate-950/15"><div className="relative isolate min-h-[340px] p-6 sm:p-10 lg:p-14"><div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_82%_18%,rgba(249,115,22,0.55),transparent_26%),radial-gradient(circle_at_20%_90%,rgba(234,88,12,0.33),transparent_32%)]" /><div className="flex items-center justify-between"><BrandMark className="h-11 w-11" /><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold">{tableLabel}</span></div><div className="mt-12 max-w-xl pb-20 sm:mt-16"><h1 className="break-words text-3xl font-bold tracking-tight sm:text-5xl">{shopName}</h1><Link className="mt-6 inline-flex" to={session ? '/menu' : '/join'}><Button className="px-6 py-3.5">{session ? t("Continue ordering") : t("Join your table")} <span className="ml-2">→</span></Button></Link></div><div className="absolute bottom-7 right-7 hidden rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur sm:block"><p className="text-xs text-slate-300">{t("Dining with")}</p><p className="mt-1 font-bold">{session ? `${session.customerNickname} · ${t('Table {{number}}', { number: session.tableNumber })}` : shopName}</p></div></div></div>
}

export default Landing
import BrandMark from '../../components/common/BrandMark'
