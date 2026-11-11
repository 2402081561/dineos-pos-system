import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { Link } from 'react-router-dom'
import SectionHeading from '../../components/common/SectionHeading'
import useCustomerSession from '../../hooks/useCustomerSession'

function More() {
  const { t } = useCustomerLanguage()
  const { session } = useCustomerSession()
  const links = [
    ...(session?.memberId ? [
      { label: 'Membership', description: 'View your profile, points and points history.', to: '/member' },
      { label: 'Rewards', description: 'Browse the rewards available to members.', to: '/rewards' },
    ] : []),
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SectionHeading eyebrow={t('Table {{number}}', { number: session?.tableNumber ?? '—' })} title={t("More")} />
      {links.length > 0 ? <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {links.map(({ label, description, to }) => (
          <Link className="flex items-center justify-between gap-3 p-4 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300" key={to} to={to}>
            <div><p className="text-sm font-bold text-slate-900">{t(label)}</p><p className="mt-1 text-xs leading-5 text-slate-500">{t(description)}</p></div>
            <span aria-hidden="true" className="text-xl text-slate-400">›</span>
          </Link>
        ))}
      </div> : <section className="rounded-2xl border border-slate-100 bg-white px-6 py-8 text-center">
        <h2 className="text-base font-bold text-slate-900">{t('Customer accounts will be available here later.')}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">{t('Membership is optional. Guest ordering works without an account.')}</p>
      </section>}
    </div>
  )
}

export default More
