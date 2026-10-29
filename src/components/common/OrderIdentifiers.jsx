import { useEffect, useRef, useState } from 'react'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { getOrderIdentifiers, saveOrderIdentifiers } from '../../services/adminApiService'
import Button from './Button'

export default function OrderIdentifiers({ orderId, onState }) {
  const {t}=useCustomerLanguage()
  const [saved,setSaved]=useState(null),[draft,setDraft]=useState({ticketSeat:'',ticketReference:''}),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const active=useRef(true),flight=useRef(false),notify=useRef(onState)
  notify.current=onState
  const dirty=Boolean(saved&&(draft.ticketSeat!==saved.ticketSeat||draft.ticketReference!==saved.ticketReference))
  useEffect(()=>{ notify.current?.({...draft,canPrint:Boolean(saved&&!dirty&&!busy&&!error)}) },[draft,saved,dirty,busy,error])
  useEffect(()=>{
    active.current=true
    let mounted=true
    getOrderIdentifiers(orderId).then((value)=>{if(mounted){setSaved(value);setDraft({ticketSeat:value.ticketSeat,ticketReference:value.ticketReference});setError('')}}).catch((failure)=>{if(mounted)setError(failure.message)})
    return()=>{mounted=false;active.current=false}
  },[orderId])
  async function save(){
    if(flight.current||!saved)return
    flight.current=true;setBusy(true);setError('')
    try {const value=await saveOrderIdentifiers(orderId,{...draft,expectedRevision:saved.ticketRevision});if(active.current){setSaved(value);setDraft({ticketSeat:value.ticketSeat,ticketReference:value.ticketReference})}}
    catch(failure){if(active.current)setError(failure.message)}
    finally{flight.current=false;if(active.current)setBusy(false)}
  }
  async function reload(){
    if(flight.current)return
    flight.current=true;setBusy(true)
    try {const value=await getOrderIdentifiers(orderId);if(active.current){setSaved(value);setDraft({ticketSeat:value.ticketSeat,ticketReference:value.ticketReference});setError('')}}
    catch(failure){if(active.current)setError(failure.message)}
    finally{flight.current=false;if(active.current)setBusy(false)}
  }
  return <section className="my-3 space-y-2 rounded-xl border border-slate-200 p-3">
    <p className="text-sm font-bold">{t('Saved order identifiers')}</p>
    {['ticketSeat','ticketReference'].map((key)=><label className="block text-xs" key={key}>{t(key==='ticketSeat'?'Table / seat':'Phone suffix / car plate')}<input maxLength={80} disabled={!saved||busy} className="mt-1 w-full rounded-lg border p-2 text-sm" value={draft[key]} onChange={(event)=>setDraft((current)=>({...current,[key]:event.target.value}))}/></label>)}
    <Button disabled={!saved||busy||(!dirty&&!error)} onClick={()=>void save()} variant="outline">{t('Save identifiers')}</Button>
    {dirty&&<p className="text-xs text-amber-800">{t('Save identifiers before printing. They will be kept with this order.')}</p>}
    {error&&<div role="alert" className="text-xs text-red-700"><p>{t(error)}</p><Button disabled={busy} variant="outline" onClick={()=>void reload()}>{t('Reload identifiers')}</Button></div>}
  </section>
}
