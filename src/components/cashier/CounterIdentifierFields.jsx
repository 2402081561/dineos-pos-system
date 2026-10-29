import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useEffect,useState } from 'react'
import { getTableVisits } from '../../services/adminApiService'
export default function CounterIdentifierFields({ draft,disabled,onChange }) {
  const {t}=useCustomerLanguage()
  const [enabled,setEnabled]=useState(false)
  useEffect(()=>{let active=true;getTableVisits().then(()=>{if(active)setEnabled(true)}).catch(()=>{});return()=>{active=false}},[])
  return <div className="mt-3 space-y-2">{['ticketSeat','ticketReference'].map((key)=><label key={key} className="block text-xs font-semibold">{t(key==='ticketSeat'?'Table / seat':'Phone suffix / car plate')}<input id={`counter-${key}`} disabled={disabled||!enabled} maxLength={80} value={draft[key]??''} onChange={(event)=>onChange(key,event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label>)}{!enabled&&<p className="text-xs text-slate-500">{t('This feature needs database upgrade 032 before use.')}</p>}</div>
}
