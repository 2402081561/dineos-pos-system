import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import { createSupabaseCashierOrder, getSupabaseCashierOrderSetup } from '../../services/adminApiService'
import { formatCurrency } from '../../utils/currency'
import { getImageSource, useImageFallback } from '../../utils/image'

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100

function NewOrder() {
  const [searchParams] = useSearchParams()
  const [setup, setSetup] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [selectedTableId, setSelectedTableId] = useState(searchParams.get('tableId') || '')
  const [customerNickname, setCustomerNickname] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [cart, setCart] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [placedOrder, setPlacedOrder] = useState(null)
  const requestId = useRef(null)
  const submitting = useRef(false)

  async function loadSetup() {
    try {
      setIsLoading(true)
      const result = await getSupabaseCashierOrderSetup()
      setSetup(result)
      setLoadError('')
    } catch (error) {
      setLoadError(error.message || 'Could not load tables and menu. Please try again.')
    } finally { setIsLoading(false) }
  }

  useEffect(() => {
    let active = true
    getSupabaseCashierOrderSetup()
      .then((result) => { if (active) { setSetup(result); setLoadError(''); setIsLoading(false) } })
      .catch((error) => { if (active) { setLoadError(error.message || 'Could not load tables and menu.'); setIsLoading(false) } })
    return () => { active = false }
  }, [])

  const selectedTable = setup?.tables.find((table) => table.id === selectedTableId)
  const menu = useMemo(() => setup?.items ?? [], [setup])
  const categories = useMemo(() => ['All', ...new Set(menu.map((item) => item.categoryName || 'Other'))], [menu])
  const filtered = menu.filter((item) => {
    const matchesCategory = category === 'All' || (item.categoryName || 'Other') === category
    const matchesSearch = item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())
    return matchesCategory && matchesSearch
  })
  const cartItems = menu.filter((item) => cart[item.id]?.quantity > 0).map((item) => ({ ...item, ...cart[item.id] }))
  const validPrice = (price) => price !== null && price !== undefined && String(price).trim() !== '' && Number.isFinite(Number(price)) && Number(price) >= 0 && Number(price) <= 999999.99
  const hasInvalidItems = Object.keys(cart).some((id) => !menu.some((item) => item.id === id && item.isAvailable === true && validPrice(item.price) && cart[id]?.quantity > 0 && cart[id]?.quantity <= 50))
  const subtotal = hasInvalidItems ? null : roundMoney(cartItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0))
  const serviceCharge = subtotal === null ? null : roundMoney(subtotal * 0.1)
  const sst = subtotal === null ? null : roundMoney(subtotal * 0.06)
  const total = subtotal === null ? null : roundMoney(subtotal + serviceCharge + sst)

  function updateCart(itemId, quantity) {
    if (submitting.current) return
    setCart((current) => {
      const next = { ...current }
      if (quantity <= 0) delete next[itemId]
      else next[itemId] = { quantity: Math.min(quantity, 50), notes: current[itemId]?.notes ?? '', name: menu.find((item) => item.id === itemId)?.name ?? current[itemId]?.name ?? 'Menu item' }
      return next
    })
    requestId.current = null
    setSubmitError('')
  }

  function updateNotes(itemId, notes) {
    setCart((current) => ({ ...current, [itemId]: { ...current[itemId], notes } }))
    requestId.current = null
    setSubmitError('')
  }

  async function placeOrder(event) {
    event.preventDefault()
    if (submitting.current || !selectedTable || cartItems.length === 0 || hasInvalidItems || !Number.isFinite(total)) return
    submitting.current = true
    setIsSubmitting(true)
    setSubmitError('')
    requestId.current ??= crypto.randomUUID()
    try {
      const result = await createSupabaseCashierOrder({
        tableId: selectedTable.id,
        expectedTableSessionId: selectedTable.tableSessionId,
        customerNickname,
        items: cartItems.map((item) => ({ menuItemId: item.id, quantity: item.quantity, notes: item.notes })),
        requestId: requestId.current,
      })
      setPlacedOrder({ ...result.order, tableNumber: selectedTable.tableNumber })
      setCart({})
      requestId.current = null
    } catch (error) {
      setSubmitError(error.message || 'Could not place this order. Please try again.')
    } finally {
      submitting.current = false
      setIsSubmitting(false)
    }
  }

  if (placedOrder) return <div className="mx-auto max-w-xl space-y-6">
    <SectionHeading eyebrow="Cashier POS" title="Order sent to kitchen" description={`Table ${placedOrder.tableNumber} · Order ${placedOrder.tableOrderNumber ?? 'received'}`} />
    <div className="surface-card p-6"><p className="text-sm text-slate-600">The kitchen can now prepare this order. Payment remains pending until it has been served.</p><p className="mt-4 text-xl font-bold text-orange-600">{formatCurrency(placedOrder.grandTotal)}</p></div>
    <div className="flex flex-wrap gap-3"><Button onClick={() => { setPlacedOrder(null); setCustomerNickname(''); void loadSetup() }}>Another order</Button><Link className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold" to="/cashier">Back to dashboard</Link></div>
  </div>

  return <div className="space-y-6">
    <SectionHeading eyebrow="Cashier POS" title="New counter order" description="Select a table, add dishes and send the order to the kitchen." action={<Link className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold" to="/cashier">Back to dashboard</Link>} />
    {loadError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{loadError} <button className="ml-2 font-bold underline" onClick={() => void loadSetup()} type="button">Retry</button></div>}
    {setup && <div className="flex justify-end"><button className="text-sm font-semibold text-orange-700 underline disabled:opacity-50" disabled={isLoading || isSubmitting} onClick={() => void loadSetup()} type="button">{isLoading ? 'Refreshing...' : 'Refresh tables & menu'}</button></div>}
    {isLoading && !setup ? <StatePanel title="Loading tables and menu" description="Please wait a moment." /> : !setup ? null : <form className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]" onSubmit={placeOrder}>
      <div className="space-y-5">
        <section className="surface-card p-5"><h2 className="text-lg font-bold">1. Select table</h2><label className="mt-4 block text-sm font-semibold" htmlFor="counter-table">Table</label><select id="counter-table" className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3" disabled={isSubmitting} required value={selectedTableId} onChange={(event) => { setSelectedTableId(event.target.value); requestId.current = null; setSubmitError('') }}><option value="">Choose a table</option>{setup.tables.map((table) => <option key={table.id} value={table.id}>Table {table.tableNumber}</option>)}</select>{setup.tables.length === 0 && <p className="mt-3 text-sm text-slate-500">No enabled tables are available.</p>}</section>
        <section className="surface-card p-5"><h2 className="text-lg font-bold">2. Add dishes</h2><input aria-label="Search menu" className="mt-4 w-full rounded-xl border border-slate-200 p-3" onChange={(event) => setSearch(event.target.value)} placeholder="Search dishes or drinks" type="search" value={search} /><div className="mt-3 flex flex-wrap gap-2">{categories.map((name) => <button aria-pressed={category === name} className={`max-w-full break-words rounded-full px-3 py-2 text-sm font-semibold ${category === name ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600'}`} key={name} onClick={() => setCategory(name)} type="button">{name}</button>)}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{filtered.map((item) => {
            const quantity = cart[item.id]?.quantity ?? 0
            const available = item.isAvailable === true && validPrice(item.price)
            return <article className="flex min-w-0 gap-3 rounded-2xl border border-slate-100 p-3" key={item.id}><img alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" onError={useImageFallback} src={getImageSource(item.imageUrl)} /><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-bold">{item.name}</h3><p className="mt-1 text-sm text-orange-600">{available ? formatCurrency(item.price) : 'Sold out / unavailable'}</p><div className="mt-2 flex items-center gap-2"><button aria-label={`Remove one ${item.name}`} className="h-8 w-8 rounded-lg bg-slate-100 font-bold disabled:opacity-40" disabled={isSubmitting || quantity === 0} onClick={() => updateCart(item.id, quantity - 1)} type="button">−</button><span className="min-w-5 text-center text-sm font-bold">{quantity}</span><button aria-label={`Add one ${item.name}`} className="h-8 w-8 rounded-lg bg-orange-600 font-bold text-white disabled:opacity-40" disabled={isSubmitting || !available || quantity >= 50 || (quantity === 0 && Object.keys(cart).length >= 30)} onClick={() => updateCart(item.id, quantity + 1)} type="button">+</button></div></div></article>
          })}</div>{filtered.length === 0 && <p className="mt-4 text-sm text-slate-500">No matching dishes.</p>}</section>
      </div>
      <aside className="surface-card p-5 lg:sticky lg:top-24"><h2 className="text-lg font-bold">3. Review order</h2><p className="mt-1 text-sm text-slate-500">{selectedTable ? `Table ${selectedTable.tableNumber}` : 'Choose a table first'}</p><label className="mt-4 block text-sm font-semibold" htmlFor="counter-name">Customer name <span className="font-normal text-slate-500">(optional)</span></label><input id="counter-name" className="mt-2 w-full rounded-xl border border-slate-200 p-3" disabled={isSubmitting} maxLength={80} onChange={(event) => { setCustomerNickname(event.target.value); requestId.current = null }} placeholder="Guest" value={customerNickname} />
        <div className="mt-5 space-y-3">{cartItems.map((item) => <div className="rounded-xl border border-slate-100 p-3" key={item.id}><div className="flex justify-between gap-2 text-sm"><strong className="min-w-0 break-words">{item.quantity} × {item.name}</strong><span className="shrink-0">{formatCurrency(Number(item.price) * item.quantity)}</span></div><input aria-label={`Note for ${item.name}`} className="mt-2 w-full rounded-lg border border-slate-200 p-2 text-xs" disabled={isSubmitting} maxLength={500} onChange={(event) => updateNotes(item.id, event.target.value)} placeholder="Kitchen note (optional)" value={item.notes} /></div>)}{Object.entries(cart).filter(([id]) => !menu.some((item) => item.id === id)).map(([id, item]) => <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm" key={id}><strong>{item.name} is no longer on the menu.</strong><button className="mt-2 block text-red-700 underline" disabled={isSubmitting} onClick={() => updateCart(id, 0)} type="button">Remove item</button></div>)}</div>
        {cartItems.length === 0 && <p className="mt-5 text-sm text-slate-500">No dishes selected yet.</p>}
        <dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd>{subtotal === null ? '—' : formatCurrency(subtotal)}</dd></div><div className="flex justify-between"><dt>Service charge (10%)</dt><dd>{serviceCharge === null ? '—' : formatCurrency(serviceCharge)}</dd></div><div className="flex justify-between"><dt>SST (6%)</dt><dd>{sst === null ? '—' : formatCurrency(sst)}</dd></div><div className="flex justify-between border-t border-slate-100 pt-3 text-base font-bold"><dt>Total</dt><dd>{total === null ? '—' : formatCurrency(total)}</dd></div></dl>
        {hasInvalidItems && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">A dish is unavailable or invalid. Remove it, then review the order.</p>}
        {submitError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{submitError} <button className="mt-2 block font-bold underline" disabled={isLoading} onClick={() => void loadSetup()} type="button">Refresh and review</button></p>}
        <Button className="mt-5 w-full" disabled={isSubmitting || isLoading || !selectedTable || cartItems.length === 0 || hasInvalidItems || !Number.isFinite(total)} type="submit">{isSubmitting ? 'Sending order...' : 'Send to kitchen'}</Button><p className="mt-2 text-xs text-slate-500">Menu availability and prices are checked again when you send the order.</p>
      </aside>
    </form>}
  </div>
}

export default NewOrder
