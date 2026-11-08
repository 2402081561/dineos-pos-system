import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useStaffTables from '../../hooks/useStaffTables'
import { tableStatusLabel as formatStatus } from '../../utils/tableStatusPresentation'

const statusStyles = {
  available: 'bg-emerald-50 text-emerald-700',
  occupied: 'bg-amber-50 text-amber-700',
  ordering: 'bg-blue-50 text-blue-700',
  awaiting_payment: 'bg-orange-50 text-orange-700',
  ready_to_clear: 'bg-sky-50 text-sky-700',
  inactive: 'bg-slate-100 text-slate-500',
}

function Tables() {
  const { t: uiText } = useCustomerLanguage()

  const { error, isLoading, tableOverview } = useStaffTables()
  if (isLoading) return <div className="space-y-6 animate-pulse"><div className="h-20 rounded-3xl bg-slate-200" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div className="h-48 rounded-3xl bg-white" key={index} />)}</div></div>
  if (error) return <StatePanel description={uiText(error)} title={uiText("Table overview unavailable")} tone="error" />
  return <div className="space-y-7"><SectionHeading description={uiText("Live occupancy, ordering and payment status for every table.")} eyebrow={uiText("Floor overview")} title={uiText("Table status")} />{tableOverview.length === 0 ? <StatePanel description={uiText("Add restaurant tables in Admin to see them here.")} title={uiText("No tables configured.")} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{tableOverview.map((table) => <article className="surface-card p-5" key={table.id}><div className="flex items-start justify-between gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-lg font-extrabold text-slate-800">{table.tableNumber}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[table.status] ?? statusStyles.available}`}>{uiText(formatStatus(table.status))}</span></div><h2 className="mt-5 text-lg font-extrabold text-slate-900">{uiText("Table")}{' '}{table.tableNumber}</h2><p className="mt-1 text-sm text-slate-500">{uiText("Capacity")}{' '}{table.capacity ?? '—'} · {table.participantCount}{' '}{uiText("customer")}{table.participantCount === 1 ? '' : 's'}</p><div className="mt-5 rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{uiText("Current activity")}</p><p className="mt-1 text-sm font-extrabold text-slate-800">{table.status === 'awaiting_payment' ? `RM ${table.unpaidTotal.toFixed(2)} unpaid` : table.status === 'ordering' ? `${table.tableOrders.length} active order${table.tableOrders.length === 1 ? '' : 's'}` : table.status === 'ready_to_clear' ? uiText("Ready for turnover") : table.status === 'occupied' ? uiText("Guests at table") : uiText("No active session")}</p></div></article>)}</div>}</div>
}

export default Tables
