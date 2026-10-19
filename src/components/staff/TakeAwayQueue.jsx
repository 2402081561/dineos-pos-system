import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import OrderTypeBadge from '../common/OrderTypeBadge'
import OptionSummary from '../common/OptionSummary'
import useTakeAwayOrders from '../../hooks/useTakeAwayOrders'

export default function TakeAwayQueue() {
  const { t: uiText, locale } = useCustomerLanguage()

  const { orders, error, isLoading, refresh } = useTakeAwayOrders()
  return <section className="space-y-3">
    <div><h2 className="text-xl font-extrabold text-slate-900">{uiText("Take-away orders")}</h2><p className="mt-1 text-sm text-slate-500">{uiText("Check packing and collection with the kitchen. Updates automatically.")}</p></div>
    {error ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{uiText(error)}<button onClick={() => void refresh()} className="ml-2 font-bold underline" type="button">{uiText("Retry")}</button></div> : isLoading ? <p className="text-sm text-slate-500">{uiText("Loading take-away orders...")}</p> : orders.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-slate-500">{uiText("No take-away orders waiting.")}</p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{orders.map((order) => <article className={`rounded-2xl border bg-white p-4 ${order.status === 'ready' ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-violet-200'}`} key={order.id}>
      <div className="flex flex-wrap justify-between gap-2"><strong>{uiText("Table")}{' '}{order.tableNumber} · {order.orderNumber}</strong><OrderTypeBadge orderType={order.orderType} /></div>
      <p className="mt-2 text-sm font-bold text-violet-800">{order.status === 'ready' ? uiText("Ready for collection") : order.status === 'preparing' ? uiText("Preparing / packing") : uiText("Received by kitchen")}</p>
      <p className="mt-1 text-xs text-slate-500">{uiText(order.customerNickname || 'Guest')} · {new Date(order.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</p>
      {order.items.map((item) => <div className="mt-3 border-t pt-2 text-sm" key={item.id}><strong>{item.quantity} × {item.name}</strong><OptionSummary item={item} />{item.notes && <p className="text-xs font-semibold text-amber-800">{uiText("Note:")}{' '}{item.notes}</p>}</div>)}
    </article>)}</div>}
  </section>
}
