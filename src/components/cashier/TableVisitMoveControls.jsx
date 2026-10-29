import { useEffect, useRef, useState } from 'react'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import useAdminAuth from '../../hooks/useAdminAuth'
import { getTableVisits, moveTableVisit } from '../../services/adminApiService'
import Button from '../common/Button'
import { formatCurrency } from '../../utils/currency'

export default function TableVisitMoveControls({ table,onDone }) {
  const {t}=useCustomerLanguage(),{authUser}=useAdminAuth()
  const actor=authUser?.id,key=`dineos-table-move-v1:${actor}`
  const [tables,setTables]=useState(null),[targetId,setTargetId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [pending,setPending]=useState(()=>{
    try {const raw=sessionStorage.getItem(key);if(!raw)return null;const value=JSON.parse(raw);if(value.actorId!==actor||!value.body?.requestId||!['move','merge'].includes(value.body.mode))throw new Error();return value}
    catch{return {damaged:true}}
  })
  const flight=useRef(false),owner=useRef(actor),active=useRef(true)
  owner.current=actor
  useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
  async function load(){
    if(flight.current)return
    flight.current=true;setBusy(true);setError('')
    try {const rows=await getTableVisits();if(active.current&&owner.current===actor)setTables(rows)}
    catch(failure){if(active.current)setError(failure.message)}
    finally{flight.current=false;if(active.current)setBusy(false)}
  }
  const source=tables?.find((entry)=>entry.id===table.id),target=tables?.find((entry)=>entry.id===targetId)
  async function submit(){
    if(flight.current||!actor||pending?.damaged)return
    if(pending&&pending.actorId!==actor)return
    let record=pending
    try {
      if(!record){
        if(!source||source.tableSessionId!==table.tableSessionId||!target)return
        const body={requestId:crypto.randomUUID(),sourceTableId:source.id,targetTableId:target.id,sourceSessionId:source.tableSessionId,targetSessionId:target.tableSessionId,mode:target.tableSessionId?'merge':'move',sourceOrders:source.orders,targetOrders:target.orders}
        record={actorId:actor,body}
        sessionStorage.setItem(key,JSON.stringify(record))
        setPending(record)
      }
    } catch {setError('Your browser could not save this operation safely. Do not continue.');return}
    flight.current=true;setBusy(true);setError('')
    try {
      await moveTableVisit(record.body)
      if(active.current&&owner.current===actor){sessionStorage.removeItem(key);setPending(null);onDone()}
    } catch(failure){
      if(active.current&&owner.current===actor){
        // A response lost earlier must always keep the original key. An initial
        // definitive rejection did not move anything and may be reviewed again.
        if(!pending&&[400,409].includes(failure.status)){sessionStorage.removeItem(key);setPending(null);setTables(null)}
        setError(failure.message)
      }
    } finally {flight.current=false;if(active.current)setBusy(false)}
  }
  if(pending&&!pending.damaged&&pending.actorId!==actor)return <p role="status">{t('Reopen this panel after switching accounts.')}</p>
  return <section className="mb-4 space-y-3 rounded-xl border border-slate-200 p-3">
    <p className="font-bold">{t('Move / merge table bill')}</p>
    <p className="text-xs text-slate-600">{t('Whole visit only. Neither table may contain any payment. Prices, kitchen progress and existing receipts are not changed.')}</p>
    {pending?<><p className="text-sm text-amber-800">{t(pending.damaged?'Saved table move is unreadable. Ask an administrator to check before starting another move.':'Previous table move needs confirmation. Retry uses the same request; do not start another operation.')}</p><Button disabled={busy||pending.damaged} onClick={()=>void submit()}>{t('Confirm / retry same table move')}</Button></>:<>
      <Button disabled={busy} variant="outline" onClick={()=>void load()}>{t('Load current tables')}</Button>
      {tables&&<><label className="block text-sm">{t('Destination table')}<select className="mt-1 w-full rounded-lg border p-2" disabled={busy} value={targetId} onChange={(event)=>setTargetId(event.target.value)}><option value="">{t('Select a table')}</option>{tables.filter((entry)=>entry.id!==table.id).map((entry)=><option key={entry.id} value={entry.id} disabled={entry.hasPayments}>{t('Table')} {entry.tableNumber} · {t(entry.tableSessionId?'Merge bills':'Move to empty table')} · {formatCurrency(entry.unpaidTotal)}</option>)}</select></label>
      {source?.hasPayments&&<p className="text-sm text-red-700">{t('Tables with any payment cannot be moved or merged.')}</p>}
      {source&&target&&<p className="text-sm font-bold">{t('Table')} {source.tableNumber} → {target.tableNumber} · {formatCurrency(Number(source.unpaidTotal)+Number(target.unpaidTotal))}</p>}
      <Button disabled={busy||!target||!source||source.hasPayments||target.hasPayments||source.tableSessionId!==table.tableSessionId} onClick={()=>void submit()}>{t('Confirm table move / merge')}</Button></>}
    </>}
    {error&&<p role="alert" className="text-sm text-red-700">{t(error)}</p>}
  </section>
}
