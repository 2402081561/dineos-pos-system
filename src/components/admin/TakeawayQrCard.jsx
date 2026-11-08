import { useState } from 'react'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import useShopSettings from '../../hooks/useShopSettings'
import Button from '../common/Button'

export default function TakeawayQrCard() {
  const {t}=useCustomerLanguage()
  const {config}=useShopSettings()
  const [image,setImage]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const url=new URL('/takeaway',window.location.origin).href
  async function generate() {
    if(busy)return
    setBusy(true);setError('')
    try {
      const QRCode=await import('qrcode')
      setImage(await QRCode.toDataURL(url,{width:320,margin:2,errorCorrectionLevel:'M'}))
    } catch {setError('QR code could not be generated. Please retry.')}
    finally {setBusy(false)}
  }
  return <section className="surface-card space-y-3 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">{t('Take-away QR code')}</h2><p className="mt-1 text-sm text-slate-500">{t('One shared QR, separate private carts and pickup numbers. No table is created.')}</p></div><Button variant="outline" disabled={busy} onClick={()=>image?setImage(''):void generate()}>{t(image?'Hide QR code':'Show take-away QR')}</Button></div>
    {!config.takeawayQrEnabled && <p className="text-xs text-amber-800">{t('Enable take-away QR in Shop settings before customers use this code.')}</p>}
    {image && <div className="space-y-3 text-center"><img className="mx-auto h-64 w-64" src={image} alt={t('Take-away QR code')}/><p className="break-all text-xs text-slate-500">{url}</p><div className="flex flex-wrap justify-center gap-3"><a className="rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white" href={image} download="dineos-takeaway-qr.png">{t('Download take-away QR')}</a><a className="rounded-xl border px-4 py-3 text-sm font-semibold" href={url} target="_blank" rel="noreferrer">{t('Open take-away page')}</a></div>{/^localhost$|^127\.0\.0\.1$/.test(window.location.hostname) && <p className="text-xs leading-5 text-amber-800">{t('Local preview only. This QR will not open on another phone until a reachable website is configured.')}</p>}</div>}
    {error && <p role="alert" className="text-sm text-red-700">{t(error)}</p>}
  </section>
}
