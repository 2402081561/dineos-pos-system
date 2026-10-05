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

  return <div className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-2xl shadow-slate-950/15"><div className="relative isolate min-h-[600px] p-6 sm:p-10 lg:p-14"><div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_82%_18%,rgba(249,115,22,0.55),transparent_26%),radial-gradient(circle_at_20%_90%,rgba(234,88,12,0.33),transparent_32%)]" /><div className="flex items-center justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-xl">⌁</div><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold">{tableLabel}</span></div><div className="mt-24 max-w-xl sm:mt-32"><p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-300">{t("A better table experience")}</p><h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">{t("Good food.")}{' '}<span className="text-orange-400">{t("Great company.")}</span></h1><p className="mt-5 max-w-md text-base leading-7 text-slate-300">{t("Browse the menu, order together and enjoy every moment at your own pace.")}</p><Link className="mt-8 inline-flex" to={session ? '/menu' : '/join'}><Button className="px-6 py-3.5">{session ? t("Continue ordering") : t("Join your table")} <span className="ml-2">→</span></Button></Link></div><div className="absolute bottom-7 right-7 hidden rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur sm:block"><p className="text-xs text-slate-300">{t("Dining with")}</p><p className="mt-1 font-bold">{session ? `${session.customerNickname} · ${t('Table {{number}}', { number: session.tableNumber })}` : shopName}</p></div></div></div>
}

export default Landing
