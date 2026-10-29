import { useState } from 'react'
import KitchenOrderCard from './KitchenOrderCard'
import KitchenTicketDialog from './KitchenTicketDialog'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'

export default function PrintableKitchenOrderCard(props) {
  const [open, setOpen] = useState(false)
  const { t } = useCustomerLanguage()
  return <div>{(props.order.ticketSeat||props.order.ticketReference)&&<p className="mb-2 break-words rounded-lg bg-amber-50 p-3 text-lg font-bold">{[props.order.ticketSeat,props.order.ticketReference].filter(Boolean).join(' · ')}</p>}<KitchenOrderCard {...props} /><button disabled={props.isUpdating} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-bold disabled:opacity-40" onClick={() => setOpen(true)} type="button">{t('Print kitchen ticket')}</button>{open && <KitchenTicketDialog order={props.isUpdating ? null : props.order} onClose={() => setOpen(false)} />}</div>
}
