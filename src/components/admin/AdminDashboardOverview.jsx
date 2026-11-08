import { orderLocationLabel } from '../../utils/orderLocation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import RecentOrderDetailsPanel from '../common/RecentOrderDetailsPanel'
import { formatCurrency } from '../../utils/currency'
import { orderNumber, orderStatusLabel, orderStatusStyle } from '../../utils/adminOrderPresentation'
import { canOpenCurrentOrderVisit } from '../../utils/adminRecentOrders'
import { tableStatusLabel } from '../../utils/tableStatusPresentation'

function DetailsDrawer({ children, close, label, closing }) {
  const ref = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    const key = (event) => {
      if (event.key === 'Escape') close()
      if (event.key !== 'Tab') return
      const focusable = [...ref.current.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) { event.preventDefault(); return }
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus?.() }
  }, [close])
  return createPortal(<div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch" role="presentation">
    <div className={`admin-details-backdrop absolute inset-0 bg-slate-900/50 ${closing ? 'is-closing' : ''}`} onClick={close} />
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className={`admin-details-drawer relative max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl outline-none sm:max-h-none sm:max-w-md sm:rounded-none ${closing ? 'is-closing' : ''}`}>{children}</div>
  </div>, document.body)
}

function TableDetails({ selection, table, floor, close }) {
  const { t, language } = useCustomerLanguage()
  const zh = language === 'zh'
  const changed = !table || (table.tableSessionId ?? null) !== selection.sessionId
  const unavailable = floor.isLoading || Boolean(floor.error)
  const base = 'block rounded-lg px-4 py-3 text-center text-sm font-semibold'
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <header className="flex items-center justify-between border-b border-slate-100 p-4"><h2 className="font-bold">{t('Table')} {table?.tableNumber ?? '—'}</h2><button type="button" onClick={close} aria-label={t('Close')} className="rounded-lg px-2 text-2xl text-slate-500">×</button></header>
    {changed ? <p className="p-5 text-sm text-amber-800">{zh ? '这张桌的桌次已改变，请关闭并重新选择桌位。' : 'This table visit has changed. Close and select the table again.'}</p> : <div className="space-y-4 p-5">
      {unavailable && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{zh ? '桌位资料暂时无法更新，请稍后再试。' : 'Table data cannot be refreshed right now. Please try again.'}</p>}
      <p className="text-sm text-slate-500">{t(tableStatusLabel(table.status))}</p>
      <div className="flex items-end justify-between gap-3"><span className="text-sm text-slate-500">{t('Remaining bill')}</span><strong className="text-xl tabular-nums">{formatCurrency(table.unpaidTotal)}</strong></div>
      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm"><div><span className="text-slate-500">{t('Unpaid orders')}</span><p className="font-bold">{table.unpaidOrderCount ?? 0}</p></div><div><span className="text-slate-500">{t('Paid orders')}</span><p className="font-bold">{table.paidOrderCount ?? 0}</p></div></div>
      {!unavailable && <div className="space-y-2 border-t border-slate-100 pt-4"><Link className={`${base} bg-orange-600 text-white hover:bg-orange-700`} to={`/cashier?tableId=${encodeURIComponent(table.id)}`}>{zh ? '前往收银台查看 / 收款' : 'View table / collect payment'}</Link><Link className={`${base} border border-slate-200 text-slate-700 hover:bg-orange-50`} to={`/cashier/new-order?tableId=${encodeURIComponent(table.id)}`}>{t('Add order')}</Link></div>}
      <p className="text-xs leading-5 text-slate-500">{zh ? '收款及桌位操作会在收银台确认。' : 'Payment and table actions are confirmed in the cashier.'}</p>
    </div>}
  </section>
}

export default function AdminDashboardOverview({ data, floor }) {
  const { t, language } = useCustomerLanguage()
  const zh = language === 'zh'
  const { state } = useLocation()
  const [selection, setSelection] = useState(state?.orderId ? { kind: 'order', id: state.orderId } : null)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef(null)
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1280px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1280px)')
    const update = () => setDesktop(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => () => clearTimeout(closeTimer.current), [])
  const close = useCallback(() => {
    if (closeTimer.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setSelection(null); return }
    setClosing(true)
    closeTimer.current = setTimeout(() => { setSelection(null); setClosing(false); closeTimer.current = null }, 240)
  }, [])
  const select = (value) => {
    clearTimeout(closeTimer.current)
    closeTimer.current = null
    setClosing(false)
    setSelection(value)
  }
  const metrics = [
    ['Today’s revenue', formatCurrency(data.todayRevenue), 'Payments recorded today'],
    ['Today’s orders', data.todayOrderCount, 'Orders created today'],
    ['Active orders', data.activeOrderCount, 'Received · preparing · ready'],
    ['Pending requests', data.pendingRequestCount, 'Customer service requests'],
  ]
  const table = selection?.kind === 'table' && floor.floorTables.find((item) => item.id === selection.id)
  const panel = selection?.kind === 'order' ? <RecentOrderDetailsPanel compact orderId={selection.id} returnTo="/admin/dashboard" onClose={close} revealOnLoad={false} renderActions={(order) => canOpenCurrentOrderVisit(order, floor) && <div className="space-y-2 border-t border-slate-100 pt-4"><Link to={`/cashier?tableId=${encodeURIComponent(order.tableId)}`} className="block rounded-lg bg-orange-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-orange-700">{zh ? '查看桌单 / 收款' : 'View table / collect payment'}</Link><Link to={`/cashier/new-order?tableId=${encodeURIComponent(order.tableId)}`} className="block rounded-lg border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-orange-50">{t('Add order')}</Link></div>} /> : selection?.kind === 'table' ? <TableDetails selection={selection} table={table} floor={floor} close={close} /> : null
  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Dashboard')}</h1><p className="mt-1 text-xs text-slate-500">{t('Today · Malaysia time · Auto updates')}</p></div><Link to="/cashier" className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700">{t('Open cashier')}</Link></header>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map(([label, value, note], index) => <section key={label} className={`min-w-0 rounded-xl border p-4 ${index === 0 ? 'border-orange-600 bg-orange-600 text-white' : 'border-slate-200 bg-white'}`}><h2 className={`text-xs font-semibold ${index === 0 ? 'text-orange-100' : 'text-slate-500'}`}>{t(label)}</h2><p className="mt-2 break-words text-xl font-bold tabular-nums sm:text-2xl">{value}</p><p className={`mt-1 text-xs leading-5 ${index === 0 ? 'text-orange-100' : 'text-slate-400'}`}>{t(note)}</p></section>)}</div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="min-w-0 space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><header className="flex items-center justify-between gap-3"><div><h2 className="font-bold">{zh ? '桌位概览' : 'Table overview'}</h2><p className="mt-1 text-xs text-slate-500">{zh ? '选择桌位，查看当前桌次' : 'Select a table to view its current visit'}</p></div><Link to="/cashier" className="text-xs font-semibold text-orange-700 hover:underline">{t('Open cashier')} →</Link></header>
        {floor.error && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t(floor.error)}</p>}
        {floor.isLoading ? <p className="mt-4 text-sm text-slate-500">{zh ? '正在加载桌位…' : 'Loading tables…'}</p> : !floor.floorTables.length && !floor.error ? <p className="mt-4 text-sm text-slate-500">{t('No tables configured.')}</p> : <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{floor.floorTables.map((entry) => <button type="button" key={entry.id} disabled={Boolean(floor.error)} onClick={() => select({ kind: 'table', id: entry.id, sessionId: entry.tableSessionId ?? null })} className={`min-w-0 rounded-xl border p-3 text-left transition focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50 ${selection?.kind === 'table' && selection.id === entry.id ? 'border-orange-400 bg-orange-50' : entry.tableSessionId ? 'border-emerald-200 bg-emerald-50 hover:border-emerald-400' : 'border-slate-200 bg-slate-50 hover:border-orange-300'}`}><span className="block truncate text-base font-bold">{t('Table')} {entry.tableNumber}</span><span className="mt-2 block text-xs text-slate-600">{t(tableStatusLabel(entry.status))}</span><span className="mt-2 block text-sm font-semibold tabular-nums">{formatCurrency(entry.unpaidTotal)}</span></button>)}</div>}
      </section>
      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white"><header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><h2 className="font-bold">{t('Recent orders')}</h2><Link to="/admin/orders" className="text-xs font-semibold text-orange-700 hover:underline">{t('View all →')}</Link></header>
        {data.recentOrders.length === 0 ? <p className="p-6 text-sm text-slate-500">{t('No recent orders.')}</p> : <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{data.recentOrders.map((order) => <button type="button" key={order.id} aria-pressed={selection?.kind === 'order' && selection.id === order.id} onClick={() => select({ kind: 'order', id: order.id })} className={`min-w-0 rounded-xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 ${selection?.kind === 'order' && selection.id === order.id ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50/30'}`}>
            <span className="block break-words text-sm font-bold text-slate-900">{orderNumber(order)}</span>
            <span className="mt-1 block text-xs text-slate-500">{orderLocationLabel(order, t)}</span>
            <span className="mt-3 flex flex-wrap items-center justify-between gap-2"><strong className="text-sm tabular-nums text-slate-900">{formatCurrency(order.grandTotal)}</strong><span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${orderStatusStyle(order.status)}`}>{t(orderStatusLabel(order.status))}</span></span>
          </button>)}</div>}
      </section>
      <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-bold">{t('Popular dishes')} · {t('Today · Top 5')}</summary>{data.popularFoods.length === 0 ? <p className="py-4 text-sm text-slate-500">{t('No food sales data for today.')}</p> : <ol className="mt-3 divide-y divide-slate-100">{data.popularFoods.map((food, index) => <li key={food.name} className="flex items-center gap-3 py-3 text-sm"><span className="text-slate-400">{index + 1}</span><span className="min-w-0 flex-1 break-words">{food.name}</span><strong>{food.quantity} {t('ordered')}</strong></li>)}</ol>}<Link to="/admin/reports" className="text-xs font-semibold text-orange-700">{t('View reports →')}</Link></details>
    </div>
    {desktop && <aside className="sticky top-24 min-w-0">{panel ? <div key={`${selection.kind}:${selection.id}`} className={`admin-details-panel ${closing ? 'is-closing' : ''}`}>{panel}</div> : <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm leading-6 text-slate-500">{zh ? '选择桌位或最近订单，在这里查看详情。' : 'Select a table or recent order to see details here.'}</section>}</aside>}
    </div>
    {!desktop && panel && <DetailsDrawer key={`${selection.kind}:${selection.id}`} close={close} closing={closing} label={selection.kind === 'table' ? t('Table details') : t('Order details')}>{panel}</DetailsDrawer>}
  </div>
}
