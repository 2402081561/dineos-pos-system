import SectionHeading from '../../components/common/SectionHeading'
import StaffRequestQueue from '../../components/staff/StaffRequestQueue'
import useStaffRequestAlerts from '../../hooks/useStaffRequestAlerts'
import useServiceRequests from '../../hooks/useServiceRequests'

function Requests() {
  const { error, isLoading, refresh, requests } = useServiceRequests()
  const { newRequests, soundEnabled, toggleSound } = useStaffRequestAlerts(requests)

  return <div className="space-y-7"><SectionHeading action={<button aria-pressed={soundEnabled} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-300" onClick={toggleSound} type="button">{soundEnabled ? '🔔 Sound on' : '🔕 Sound off'}</button>} description="Respond to customer requests in the order they arrive. Completed requests leave this queue automatically." eyebrow="Front of house" title="Needs attention" />{newRequests.length > 0 && <section aria-live="polite" className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-950 shadow-sm"><p className="font-extrabold">🔔 New service request{newRequests.length === 1 ? '' : 's'} waiting</p><p className="mt-1 text-sm text-orange-900">{newRequests.map((request) => `Table ${request.tableNumber ?? '—'} · ${request.customerNickname || 'Guest'}`).join('  •  ')}</p></section>}<StaffRequestQueue error={error} isLoading={isLoading} onRefresh={refresh} requests={requests} /></div>
}

export default Requests
