import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../../components/common/Button'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import useCustomerSession from '../../hooks/useCustomerSession'
import { getCustomerSession, getTakeawayQrConfig, joinTakeawayQr } from '../../services/customerApi'
import { customerVisitStorage } from '../../utils/customerVisitStorage'

const key = 'dineos-private-takeaway-join-v1'
const savedReference = () => {try {const value=JSON.parse(sessionStorage.getItem(key) || 'null')?.reference;return typeof value==='string'?value:''} catch {return ''}}
const hasSavedEntry = () => {try {return Boolean(sessionStorage.getItem(key))} catch {return false}}
export default function TakeawayJoin() {
  const { t }=useCustomerLanguage()
  const { session,isRestoring,clearSession,startSession }=useCustomerSession()
  const navigate=useNavigate()
  const [reference,setReference]=useState(savedReference),[config,setConfig]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[expired,setExpired]=useState(false)
  const [pending,setPending]=useState(hasSavedEntry)
  const flight=useRef(false),mounted=useRef(true)
  useEffect(()=>{
    mounted.current=true
    getTakeawayQrConfig().then(value=>{if(mounted.current)setConfig(value)}).catch(()=>{if(mounted.current)setError('Take-away ordering is temporarily unavailable. Please retry.')})
    return()=>{mounted.current=false}
  },[])
  const hasDraft=Boolean(session && customerVisitStorage.readDraft(session).items.length)
  async function join(event) {
    event.preventDefault()
    if(flight.current || isRestoring || !config?.enabled || !config.isAcceptingOrders || hasDraft || session?.isTakeawayQr) return
    flight.current=true;setBusy(true);setError('')
    try {
      let entry
      try { entry=JSON.parse(sessionStorage.getItem(key) || 'null') } catch {throw new Error('The saved take-away entry is unreadable. Do not start another visit yet.')}
      if(entry && (!/^[0-9a-f-]{36}$/i.test(entry.id) || typeof entry.reference!=='string')) throw new Error('The saved take-away entry is unreadable. Do not start another visit yet.')
      if(!entry) {
        if(!reference.trim() || reference.trim().length>40 || Array.from(reference).some(char=>{const code=char.codePointAt(0);return code<32||code>=127&&code<=159})) throw new Error('Enter a name, phone suffix or car plate (1–40 characters).')
        entry={id:crypto.randomUUID(),reference:reference.trim()}
        // Store before the HTTP call. A lost response/refresh recovers exactly
        // this private visit; the static QR contains neither this key nor token.
        sessionStorage.setItem(key,JSON.stringify(entry));setPending(true)
      }
      const next=await joinTakeawayQr(entry.reference,entry.id)
      if(!mounted.current) return
      if(session) await clearSession()
      startSession(null,next.customerNickname,next.tableSessionId,next.sessionId,'',false,{isTakeawayQr:true,visitStatus:next.visitStatus})
      navigate(next.visitStatus==='completed'?'/tracking':'/menu',{replace:true})
    } catch(failure) {if(mounted.current){setError(failure.message);setExpired(failure.message==='This take-away visit has expired. Start a new visit explicitly.')}}
    finally {flight.current=false;if(mounted.current)setBusy(false)}
  }
  async function resume() {
    if(flight.current || !session?.isTakeawayQr) return
    flight.current=true;setBusy(true);setError('')
    try { const next=await getCustomerSession(session.sessionId);if(mounted.current)navigate(next.visitStatus==='completed'?'/tracking':'/menu',{replace:true}) }
    catch(failure){if(mounted.current)setError(failure.message)}
    finally {flight.current=false;if(mounted.current)setBusy(false)}
  }
  async function newVisit() {
    if(flight.current || hasDraft) return
    flight.current=true;setBusy(true);setError('')
    try { await clearSession();sessionStorage.removeItem(key);setReference('');setExpired(false);setPending(false) }
    catch(failure){setError(failure.message)}
    finally {flight.current=false;setBusy(false)}
  }
  return <section className="mx-auto max-w-md space-y-5 rounded-3xl border border-orange-100 bg-white p-6 sm:mt-6 sm:p-8">
    <header><p className="text-sm font-bold text-orange-700">{t('Take-away ordering')}</p><h1 className="mt-2 text-2xl font-extrabold">{t('Order for collection')}</h1><p className="mt-3 text-sm leading-6 text-slate-500">{t('No table number needed. Your cart and orders are private, even when everyone scans the same QR.')}</p></header>
    {session?.isTakeawayQr ? <div className="space-y-3"><p className="rounded-xl bg-orange-50 p-3 text-sm font-semibold">{session.customerNickname}</p><Button className="w-full" disabled={busy||isRestoring} onClick={()=>void resume()}>{t('Continue my take-away visit')}</Button>{session.visitStatus==='completed' && <Button className="w-full" variant="outline" disabled={busy||hasDraft||isRestoring} onClick={()=>void newVisit()}>{t('Start a new take-away visit')}</Button>}</div> : session ? <div className="space-y-3"><p className="rounded-xl bg-amber-50 p-3 text-sm leading-6">{t(hasDraft?'Your current table cart is kept. Finish or clear it before switching to take-away.':'You have an existing table visit. Switching does not cancel orders already sent.')}</p><Link className="block py-3 text-center font-bold text-orange-700" to={hasDraft?'/cart':'/menu'}>{t('Return to my current order')}</Link>{!hasDraft && <Button variant="outline" disabled={busy||isRestoring} onClick={()=>void newVisit()}>{t('Switch to take-away ordering')}</Button>}</div> : <form className="space-y-4" onSubmit={join}>
      <label className="block text-sm font-bold">{t('Name / phone suffix / car plate')}<input className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal" maxLength={40} required autoComplete="off" disabled={busy||pending} value={reference} onChange={event=>setReference(event.target.value)} placeholder={t('e.g. 阿明 / 8821 / JJS1234')}/></label>
      <p className="text-xs leading-5 text-slate-500">{t('Enter just one reference. A short pickup number is assigned only after the order is accepted. Pay and collect at the counter.')}</p>
      <Button type="submit" className="w-full" disabled={busy||isRestoring||!config?.enabled||!config?.isAcceptingOrders}>{t(busy?'Opening your take-away visit...':'Start Ordering')}</Button>
    </form>}
    {config && (!config.enabled||!config.isAcceptingOrders) && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm">{t(!config.enabled?'Take-away QR ordering is not enabled yet.':config.orderingMessage)}</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t(error)}</p>}
    {expired && !hasDraft && <Button variant="outline" disabled={busy} onClick={()=>void newVisit()}>{t('Start a new take-away visit')}</Button>}
    <p className="text-xs leading-5 text-slate-400">{t('Keep this browser tab to recover your order after refreshing. Pickup numbers are not passwords; other customers cannot use them to view your order.')}</p>
  </section>
}
