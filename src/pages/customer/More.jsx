import { Link } from 'react-router-dom'
import SectionHeading from '../../components/common/SectionHeading'
import useCustomerSession from '../../hooks/useCustomerSession'

function More() {
  const { session } = useCustomerSession()
  const links = [
    { label: 'Call staff', description: 'Ask for assistance or send a service request.', to: '/service-requests' },
    ...(session?.memberId ? [
      { label: 'Membership', description: 'View your profile, points and points history.', to: '/member' },
      { label: 'Rewards', description: 'Browse the rewards available to members.', to: '/rewards' },
    ] : []),
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SectionHeading eyebrow={`Table ${session?.tableNumber ?? '—'}`} title="More" description="Help and membership options." />
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {links.map(({ label, description, to }) => (
          <Link className="flex items-center justify-between gap-3 p-4 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300" key={to} to={to}>
            <div><p className="text-sm font-bold text-slate-900">{label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>
            <span aria-hidden="true" className="text-xl text-slate-400">›</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default More
