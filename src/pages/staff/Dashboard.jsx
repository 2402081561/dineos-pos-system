import HandoffQueue from '../../components/staff/HandoffQueue'
import TakeAwayQueue from '../../components/staff/TakeAwayQueue'
import { Link } from 'react-router-dom'
import SectionHeading from '../../components/common/SectionHeading'
import StaffRequestQueue from '../../components/staff/StaffRequestQueue'
import useStaffRequestAlerts from '../../hooks/useStaffRequestAlerts'
import useServiceRequests from '../../hooks/useServiceRequests'

function Dashboard() {
  const { error, requests, isLoading, refresh } = useServiceRequests()
  const { newRequests, soundEnabled, toggleSound } = useStaffRequestAlerts(requests)
  const waiterRequests = requests.filter((request) => request.requestType === 'callWaiter').length
  const billRequests = requests.filter((request) => request.requestType === 'requestBill').length
  const otherRequests = Math.max(requests.length - waiterRequests - billRequests, 0)

  const metrics = [
    { label: 'Pending requests', value: isLoading ? '—' : requests.length, tone: 'text-orange-600' },
    { label: 'Call waiter', value: isLoading ? '—' : waiterRequests, tone: 'text-blue-600' },
    { label: 'Bill requests', value: isLoading ? '—' : billRequests, tone: 'text-violet-600' },
    { label: 'Other requests', value: isLoading ? '—' : otherRequests, tone: 'text-emerald-600' },
  ]

  return (
    <div className="space-y-7">
      <SectionHeading
        action={<div className="flex flex-wrap items-center gap-2"><button aria-pressed={soundEnabled} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-300" onClick={toggleSound} type="button">{soundEnabled ? '🔔 Sound on' : '🔕 Sound off'}</button><Link className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2" to="/staff/requests">View all requests</Link></div>}
        description="Keep an eye on live customer requests and respond as soon as they arrive."
        eyebrow="Front of house"
        title="Staff dashboard"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article className="surface-card p-5" key={metric.label}>
            <p className="text-sm font-semibold text-slate-500">{metric.label}</p>
            <p className={`mt-2 text-3xl font-extrabold tracking-tight ${metric.tone}`}>{metric.value}</p>
          </article>
        ))}
      </div>

      {newRequests.length > 0 && <section aria-live="polite" className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-950 shadow-sm"><p className="font-extrabold">🔔 New service request{newRequests.length === 1 ? '' : 's'} waiting</p><p className="mt-1 text-sm text-orange-900">{newRequests.map((request) => `Table ${request.tableNumber ?? '—'} · ${request.customerNickname || 'Guest'}`).join('  •  ')}</p></section>}

      <HandoffQueue /><TakeAwayQueue />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Live service queue</h2>
            <p className="mt-1 text-sm text-slate-500">The newest requests appear here automatically.</p>
          </div>
          {!isLoading && requests.length > 6 && <Link className="text-sm font-bold text-orange-600 hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2" to="/staff/requests">See all</Link>}
        </div>
        <StaffRequestQueue compact error={error} isLoading={isLoading} onRefresh={refresh} requests={requests} />
      </section>
    </div>
  )
}

export default Dashboard
