import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { cartLineId, moveCartQuantity } from '../../utils/cartOrderType'
import OrderTypeSelector from '../../components/common/OrderTypeSelector'
import OrderTypeBadge from '../../components/common/OrderTypeBadge'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../../components/common/Button'
import MenuAvailabilityControl from '../../components/common/MenuAvailabilityControl'
import ConfirmationDialog from '../../components/common/ConfirmationDialog'
import useAdminAuth from '../../hooks/useAdminAuth'
import useCounterOrderDraft from '../../hooks/useCounterOrderDraft'
import { isDefinitiveOrderRejection } from '../../utils/orderSubmission'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import { createSupabaseCashierOrder, getSupabaseCashierOrderSetup } from '../../services/adminApiService'
import { formatCurrency } from '../../utils/currency'
import { getImageSource, useImageFallback } from '../../utils/image'

import CounterOptionsDialog from '../../components/cashier/CounterOptionsDialog'
import OptionSummary from '../../components/common/OptionSummary'
import { orderAmounts, resolveOptions, roundMoney } from '../../../server/src/posRules'

function NewOrder() {
  const { t: uiText } = useCustomerLanguage()

  const [searchParams] = useSearchParams()
  const { authUser } = useAdminAuth()
  const actorId = authUser?.id
  const activeActor = useRef(actorId)
  activeActor.current = actorId
  const { draft, isLocked, storageWarning, updateDraft, prepareRequest, markUncertain, rejectRequest, completeRequest, discardDamagedDraft } = useCounterOrderDraft(actorId, searchParams.get('tableId') || '')
  const { tableId: selectedTableId, customerNickname, cart } = draft
  const hasPendingRequest = Boolean(draft.request)
  const [restored] = useState(Object.keys(cart).length > 0)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [setup, setSetup] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [optionItem, setOptionItem] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [availabilityUpdates, setAvailabilityUpdates] = useState(new Set())
  const [placedOrder, setPlacedOrder] = useState(null)
  const submitting = useRef(false)
  const isEditingDisabled = isSubmitting || isLocked || isLoading || !actorId

  function changeDraft(update) {
    if (submitting.current || isLocked) return false
    return updateDraft((current) => {
      const next = update(current)
      const table = setup?.tables.find((entry) => entry.id === next.tableId)
      if (table && !Object.hasOwn(next, 'expectedTableSessionId')) {
        next.expectedTableSessionId = table.tableSessionId ?? null
        next.tableNumber = String(table.tableNumber)
      }
      return next
    })
  }
  const setCart = (update) => changeDraft((current) => ({ ...current, cart: typeof update === 'function' ? update(current.cart) : update }))
  const setCustomerNickname = (value) => changeDraft((current) => ({ ...current, customerNickname: value }))
  function setSelectedTableId(value) {
    const table = setup?.tables.find((entry) => entry.id === value)
    changeDraft((current) => ({ ...current, tableId: value, expectedTableSessionId: table?.tableSessionId ?? null, tableNumber: String(table?.tableNumber ?? '') }))
  }

  function handleAvailabilityPending(id, pending) {
    setAvailabilityUpdates((current) => {
      const next = new Set(current)
      if (pending) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function handleAvailabilityUpdated(updated) {
    setSetup((current) => current ? { ...current, items: current.items.map((item) => item.id === updated.id ? { ...item, ...updated } : item) } : current)
  }

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

  const currentTable = setup?.tables.find((table) => table.id === selectedTableId)
  const selectedTable = currentTable ?? (hasPendingRequest ? { id: selectedTableId, tableNumber: draft.tableNumber || '—' } : null)
  const tableVisitChanged = Boolean(!hasPendingRequest && selectedTableId && setup && (!currentTable || (Object.hasOwn(draft, 'expectedTableSessionId') && draft.expectedTableSessionId !== (currentTable.tableSessionId ?? null))))
  const menu = useMemo(() => setup?.items ?? [], [setup])
  const categories = useMemo(() => ['All', ...new Set(menu.map((item) => item.categoryName || 'Other'))], [menu])
  const filtered = menu.filter((item) => {
    const matchesCategory = category === 'All' || (item.categoryName || 'Other') === category
    const matchesSearch = item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())
    return matchesCategory && matchesSearch
  })
  const validPrice = (price) => price !== null && price !== undefined && String(price).trim() !== '' && Number.isFinite(Number(price)) && Number(price) >= 0 && Number(price) <= 999999.99
  const cartItems = Object.entries(cart).map(([lineId, line]) => {
    const item = menu.find((entry) => entry.id === (line.menuItemId ?? lineId))
    let options, invalid = !item || !item.isAvailable || !validPrice(item.price) || line.quantity < 1 || line.quantity > 50
    try { options = resolveOptions(item?.optionGroups ?? [], line.selections ?? []) } catch { invalid = true }
    return { ...item, ...line, id: lineId, menuItemId: item?.id ?? line.menuItemId ?? lineId, orderType: line.orderType ?? 'dine_in', price: roundMoney(Number(item?.price) + (options?.extraPrice ?? 0)), optionSnapshot: options?.optionSnapshot ?? line.optionSnapshot, invalid }
  })
  const hasInvalidItems = cartItems.some((item) => item.invalid)
  const subtotal = hasInvalidItems ? null : roundMoney(cartItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0))
  let amounts
  try { if (subtotal !== null) amounts = orderAmounts(subtotal, setup?.settings) } catch { /* blocks sending an oversized bill */ }
  const serviceCharge = amounts?.serviceCharge ?? null
  const sst = amounts?.sst ?? null
  const total = amounts?.grandTotal ?? null
  function addOptionLine(item, options) {
    if (isLocked || submitting.current) return
    const id = cartLineId(item.id, '', options.selections)
    setCart((current) => ({ ...current, [id]: { ...current[id], menuItemId: item.id, orderType: 'dine_in', selections: options.selections, optionSnapshot: options.optionSnapshot, name: item.name, notes: current[id]?.notes ?? '', quantity: Math.min(50, (current[id]?.quantity ?? 0) + 1) } }))
    setSubmitError('')
  }

  function addMenuItem(item) {
    const id = cartLineId(item.id, '', [])
    updateCart(id, (cart[id]?.quantity ?? 0) + 1, item)
  }
  function removeMenuItem(item) {
    const line = cartItems.find((line) => line.menuItemId === item.id && line.orderType === 'dine_in') ?? cartItems.find((line) => line.menuItemId === item.id)
    if (line) updateCart(line.id, line.quantity - 1)
  }
  function changeType(item, type, quantity = item.quantity) {
    if (isLocked || submitting.current) return
    const lines = Object.entries(cart).map(([id, line]) => ({ ...line, cartItemId: id, menuItemId: line.menuItemId ?? id, specialInstructions: line.notes ?? '' }))
    const result = moveCartQuantity(lines, item.id, quantity, type)
    if (result.error) { setSubmitError(result.error); return }
    setCart(Object.fromEntries(result.items.map((line) => [line.cartItemId, { ...line, notes: line.specialInstructions }])))
    setSubmitError('')
  }

  function updateCart(itemId, quantity, menuItem) {
    if (submitting.current || isLocked) return
    setCart((current) => {
      const next = { ...current }
      if (quantity <= 0) delete next[itemId]
      else next[itemId] = { ...current[itemId], menuItemId: current[itemId]?.menuItemId ?? menuItem?.id, selections: current[itemId]?.selections ?? [], orderType: current[itemId]?.orderType ?? 'dine_in', quantity: Math.min(quantity, 50), notes: current[itemId]?.notes ?? '', name: menuItem?.name ?? menu.find((item) => item.id === itemId)?.name ?? current[itemId]?.name ?? 'Menu item' }
      return next
    })
    setSubmitError('')
  }

  function updateNotes(itemId, notes) {
    if (isLocked || submitting.current) return
    setCart((current) => ({ ...current, [itemId]: { ...current[itemId], notes } }))
    setSubmitError('')
  }

  async function placeOrder(event) {
    event.preventDefault()
    if (submitting.current || !actorId || draft.recoveryRequired || availabilityUpdates.size > 0 || (!hasPendingRequest && (isLoading || tableVisitChanged || !selectedTable || cartItems.length === 0 || hasInvalidItems || !Number.isFinite(total)))) return
    submitting.current = true
    setIsSubmitting(true)
    setSubmitError('')
    let request
    try {
      request = prepareRequest(setup?.settingsRevision, currentTable?.tableSessionId ?? null)
      const result = await createSupabaseCashierOrder({ ...request.payload, requestId: request.requestId })
      if (!result?.order?.id) throw new Error('We could not confirm your last submission. Retry this same order before making changes.')
      if (activeActor.current !== actorId) return
      const tableNumber = selectedTable?.tableNumber ?? draft.tableNumber
      if (completeRequest(request.requestId)) setPlacedOrder({ ...result.order, tableNumber, tableId: request.payload.tableId, actorId })
    } catch (error) {
      if (activeActor.current !== actorId) return
      if (request) {
        if (isDefinitiveOrderRejection(error)) rejectRequest(request.requestId)
        else markUncertain(request.requestId)
      }
      setSubmitError(error.message || 'Could not place this order. Please try again.')
    } finally {
      submitting.current = false
      setIsSubmitting(false)
    }
  }

  if (placedOrder?.actorId === actorId && placedOrder) return <div className="mx-auto max-w-xl space-y-6">
    <SectionHeading eyebrow={uiText("Cashier POS")} title={uiText("Order sent to kitchen")} description={uiText("Table {{v0}} · Order {{v1}}", { v0: placedOrder.tableNumber, v1: placedOrder.tableOrderNumber ?? 'received' })} />
    <div className="surface-card p-6"><OrderTypeBadge orderType={placedOrder.orderType} /><p className="text-sm text-slate-600">{uiText("The kitchen can now prepare this order. Payment and serving or collection are recorded separately.")}</p><p className="mt-4 text-xl font-bold text-orange-600">{formatCurrency(placedOrder.grandTotal)}</p></div>
    <div className="flex flex-wrap gap-3"><Button onClick={() => { setPlacedOrder(null); void loadSetup() }}>{uiText("Another order")}</Button><Link className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold" to={placedOrder.tableId ? `/cashier?tableId=${encodeURIComponent(placedOrder.tableId)}` : "/cashier"}>{uiText("Back to dashboard")}</Link></div>
  </div>

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-bold tracking-tight text-slate-900">{uiText("New counter order")}</h1><p className="mt-1 text-xs text-slate-500">{uiText("Select a table, add dishes and send the order to the kitchen.")}</p></div>
      <div className="flex flex-wrap items-center gap-3">
        {setup && <button className="text-xs font-semibold text-orange-700 underline underline-offset-4 disabled:opacity-50" disabled={isLoading || isSubmitting} onClick={() => void loadSetup()} type="button">{isLoading ? uiText("Refreshing...") : uiText("Refresh tables & menu")}</button>}
        <Link className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-orange-200 hover:text-orange-700" to={selectedTableId ? `/cashier?tableId=${encodeURIComponent(selectedTableId)}` : "/cashier"}>{uiText("Back to dashboard")}</Link>
      </div>
    </div>
    {restored && Object.keys(cart).length > 0 && !hasPendingRequest && <p role="status" className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">{uiText('Your unfinished counter order has been restored. Review the table, dishes and latest prices before sending.')}</p>}
    {storageWarning && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{uiText('Your browser could not save this order safely. Enable session storage before sending.')}</p>}
    {hasPendingRequest && <section role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><h2 className="font-bold">{uiText('Order confirmation pending')}</h2><p className="mt-1">{uiText('Your previous counter order is awaiting confirmation. Retry it before changing dishes or tables.')}</p>{!setup && <Button className="mt-3" disabled={isSubmitting} onClick={() => void placeOrder({ preventDefault() {} })}>{isSubmitting ? uiText('Sending order...') : uiText('Retry previous order')}</Button>}</section>}
    {draft.recoveryRequired && <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{uiText('Review your saved counter order before continuing.')}</p><p className="mt-1">{uiText('Check recent orders before discarding a damaged draft to avoid a duplicate order.')}</p><div className="mt-3 flex flex-wrap gap-3"><Link to="/cashier" className="font-bold underline">{uiText('Back to dashboard')}</Link><button type="button" className="font-bold underline" onClick={() => setIsDiscarding(true)}>{uiText('Discard damaged draft')}</button></div></section>}
    {tableVisitChanged && <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>{uiText('This table visit changed. Review the bill and select the table again before sending this draft.')}</p><Button className="mt-2" onClick={() => setSelectedTableId('')} variant="outline">{uiText('Review table selection')}</Button></section>}
    {loadError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{uiText(loadError)} <button className="ml-2 font-bold underline" onClick={() => void loadSetup()} type="button">{uiText("Retry")}</button></div>}
    {isLoading && !setup ? <StatePanel title={uiText("Loading tables and menu")} description={uiText("Please wait a moment.")} /> : !setup ? null : <form className="grid min-w-0 gap-4 lg:h-[calc(100dvh-11.5rem)] lg:min-h-[32rem] lg:grid-cols-[minmax(0,1fr)_320px]" onSubmit={placeOrder}>
      <section aria-label={uiText("Counter menu")} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="shrink-0 border-b border-slate-100 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{uiText("Menu")}</h2>
            <div className="relative w-full sm:w-64"><span aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 text-slate-400">⌕</span><input aria-label={uiText("Search menu")} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder={uiText("Search dishes or drinks")} type="search" value={search} /></div>
          </div>
          <div aria-label={uiText("Menu categories")} className="mt-3 flex flex-wrap gap-1.5">{categories.map((name) => <button aria-pressed={category === name} className={`max-w-full break-words rounded-lg px-3 py-2 text-xs font-semibold transition ${category === name ? 'bg-orange-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-orange-50 hover:text-orange-700'}`} key={name} onClick={() => setCategory(name)} type="button">{name}</button>)}</div>
        </div>
        <div aria-label={uiText("Menu dishes")} className="min-h-0 p-3 sm:p-4 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{filtered.map((item) => {
            const quantity = cartItems.filter((line) => line.menuItemId === item.id).reduce((sum, line) => sum + line.quantity, 0)
            const available = item.isAvailable === true && validPrice(item.price)
            return <article className={`flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white transition ${quantity > 0 ? 'border-orange-300 ring-1 ring-orange-100' : 'border-slate-200/70'}`} key={item.id}>
              <div className="relative p-1.5"><img alt="" className={`aspect-[4/3] w-full rounded-lg object-cover ${available ? '' : 'opacity-50'}`} loading="lazy" onError={useImageFallback} src={getImageSource(item.imageUrl)} />{quantity > 0 && <span className="absolute right-3 top-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-orange-600 px-1.5 text-xs font-bold text-white">{quantity}</span>}</div>
              <div className="flex flex-1 flex-col px-3 pb-3 pt-1"><p className="mb-1 truncate text-[10px] font-medium text-slate-400" title={uiText(item.categoryName || 'Other')}>{uiText(item.categoryName || 'Other')}</p><h3 className="break-words text-sm font-semibold leading-5 text-slate-900">{item.name}</h3><p className={`mt-2 text-sm font-semibold ${available ? 'text-orange-600' : 'text-red-600'}`}>{validPrice(item.price) ? formatCurrency(item.price) : uiText("Sold out / unavailable")}</p></div>
              <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-3"><MenuAvailabilityControl item={item} disabled={isEditingDisabled || isLoading} onUpdated={handleAvailabilityUpdated} onPendingChange={handleAvailabilityPending} /></div>
              {item.optionGroups?.length ? <Button className="m-2 text-xs" disabled={isEditingDisabled || !available || Object.keys(cart).length >= 30} variant="outline" onClick={() => setOptionItem(item)}>{uiText("Choose options")}</Button> : <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2"><button aria-label={uiText("Remove one {{v0}}", { v0: item.name })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-lg font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-40" disabled={isEditingDisabled || quantity === 0} onClick={() => removeMenuItem(item)} type="button">−</button><span className="min-w-5 text-center text-sm font-bold tabular-nums">{quantity}</span><button aria-label={uiText("Add one {{v0}}", { v0: item.name })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-lg font-bold text-white hover:bg-orange-700 disabled:opacity-40" disabled={isEditingDisabled || !available || quantity >= 50 || (quantity === 0 && Object.keys(cart).length >= 30)} onClick={() => addMenuItem(item)} type="button">+</button></div>}
            </article>
          })}</div>{filtered.length === 0 && <p className="py-10 text-center text-sm text-slate-500">{uiText("No matching dishes.")}</p>}
        </div>
      </section>
      <aside aria-label={uiText("Order summary")} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="shrink-0 border-b border-slate-100 p-4">
          <h2 className="text-lg font-bold">{uiText("Order summary")}</h2>
          <label className="mt-3 block text-xs font-semibold text-slate-600" htmlFor="counter-table">{uiText("Table")}{' '}</label>
          <select id="counter-table" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" disabled={isEditingDisabled} required value={selectedTableId} onChange={(event) => { setSelectedTableId(event.target.value); setSubmitError('') }}><option value="">{uiText("Choose a table")}</option>{selectedTableId && !currentTable && <option value={selectedTableId} disabled>{uiText("Table")}{' '}{draft.tableNumber || '—'}</option>}{setup.tables.map((table) => <option key={table.id} value={table.id}>{uiText("Table")}{' '}{table.tableNumber}</option>)}</select>
          {setup.tables.length === 0 && <p className="mt-2 text-xs text-slate-500">{uiText("No enabled tables are available.")}</p>}
          <p className="mt-3 text-xs text-slate-500">{uiText("Choose Dine in or Take away separately for each dish below.")}</p>
          <label className="mt-3 block text-xs font-semibold text-slate-600" htmlFor="counter-name">{uiText("Customer name")}<span className="font-normal text-slate-400">{uiText("(optional)")}</span></label><input id="counter-name" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" disabled={isEditingDisabled} maxLength={80} onChange={(event) => { setCustomerNickname(event.target.value) }} placeholder={uiText("Guest")} value={customerNickname} />
        </div>
        <div aria-label={uiText("Selected dishes")} className="min-h-0 p-4 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
          <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-bold">{uiText("Order items")}</h3><span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">{selectedTable ? `Table ${selectedTable.tableNumber}` : uiText("No table")}</span></div>
          <div className="space-y-3">{cartItems.map((item) => <div className="rounded-xl border border-slate-100 p-2.5" key={item.id}>
            <div className="flex items-start gap-2.5"><img alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" loading="lazy" onError={useImageFallback} src={getImageSource(item.imageUrl)} /><div className="min-w-0 flex-1"><strong className="block break-words text-xs leading-5">{item.quantity} × {item.name}</strong><span className="mt-1 block text-xs font-semibold text-orange-700">{formatCurrency(Number(item.price) * item.quantity)}</span><OptionSummary item={item} /></div></div><div className="mt-2 flex items-center gap-2"><button aria-label={uiText("Decrease {{v0}}", { v0: item.name })} className="h-7 w-7 rounded bg-slate-100 font-bold" disabled={isEditingDisabled} type="button" onClick={() => updateCart(item.id, item.quantity - 1)}>−</button><span className="text-xs">{item.quantity}</span><button aria-label={uiText("Increase {{v0}}", { v0: item.name })} className="h-7 w-7 rounded bg-orange-50 font-bold text-orange-700" disabled={isEditingDisabled || item.quantity >= 50} type="button" onClick={() => updateCart(item.id, item.quantity + 1)}>+</button><button className="ml-auto text-xs text-red-600" disabled={isEditingDisabled} type="button" onClick={() => updateCart(item.id, 0)}>{uiText("Remove")}</button></div>
            <OrderTypeSelector compact value={item.orderType} onChange={(type) => changeType(item, type)} disabled={isEditingDisabled} />{item.quantity > 1 && <button className="mt-2 rounded border border-orange-200 p-2 text-xs font-bold text-orange-700" disabled={isEditingDisabled} type="button" onClick={() => changeType(item, item.orderType === "take_away" ? "dine_in" : "take_away", 1)}>{item.orderType === "take_away" ? uiText("Dine in 1 separately") : uiText("Pack 1 separately")}</button>}<input aria-label={uiText("Note for {{v0}}", { v0: item.name })} className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs" disabled={isEditingDisabled} maxLength={500} onChange={(event) => updateNotes(item.id, event.target.value)} placeholder={uiText("Kitchen note (optional)")} value={item.notes} />
          </div>)}{Object.entries(cart).filter(([id, line]) => !menu.some((item) => item.id === (line.menuItemId ?? id))).map(([id, item]) => <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm" key={id}><strong>{item.name}{' '}{uiText("is no longer on the menu.")}</strong><button className="mt-2 block text-red-700 underline" disabled={isEditingDisabled} onClick={() => updateCart(id, 0)} type="button">{uiText("Remove item")}</button></div>)}</div>
          {cartItems.length === 0 && <div className="py-6 text-center"><span aria-hidden="true" className="text-2xl text-slate-300">⌑</span><p className="mt-2 text-xs text-slate-500">{uiText("No dishes selected yet.")}</p></div>}
          {hasInvalidItems && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{uiText("A dish is unavailable or invalid. Remove it, then review the order.")}</p>}
          {submitError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{uiText(submitError)} <button className="mt-2 block font-bold underline" disabled={isLoading} onClick={() => void loadSetup()} type="button">{uiText("Refresh and review")}</button></p>}
        </div>
        <div className="shrink-0 border-t border-slate-100 bg-slate-50/50 p-4">
          <dl className="space-y-2 text-xs text-slate-600"><div className="flex justify-between gap-2"><dt>{uiText("Subtotal")}</dt><dd className="tabular-nums">{subtotal === null ? '—' : formatCurrency(subtotal)}</dd></div>{Number(setup.settings?.serviceChargeRate) > 0 && <div className="flex justify-between gap-2"><dt>{uiText("Service charge (")}{setup.settings?.serviceChargeRate ?? 10}%)</dt><dd className="tabular-nums">{serviceCharge === null ? '—' : formatCurrency(serviceCharge)}</dd></div>}{Number(setup.settings?.sstRate) > 0 && <div className="flex justify-between gap-2"><dt>{uiText("SST (")}{setup.settings?.sstRate ?? 6}%)</dt><dd className="tabular-nums">{sst === null ? '—' : formatCurrency(sst)}</dd></div>}<div className="flex justify-between gap-2 border-t border-slate-200/70 pt-3 text-base font-bold text-slate-900"><dt>{uiText("Total")}</dt><dd className="text-orange-600 tabular-nums">{total === null ? '—' : formatCurrency(total)}</dd></div></dl>
          <Button className="mt-4 w-full" disabled={isSubmitting || !actorId || draft.recoveryRequired || availabilityUpdates.size > 0 || (!hasPendingRequest && (isLoading || tableVisitChanged || !selectedTable || cartItems.length === 0 || hasInvalidItems || !Number.isFinite(total)))} type="submit">{isSubmitting ? uiText("Sending order...") : hasPendingRequest ? uiText("Retry previous order") : uiText("Send to kitchen")}</Button><p className="mt-2 text-[10px] leading-4 text-slate-400">{uiText("Menu availability and prices are checked again when you send the order.")}</p>
        </div>
      </aside>
    </form>}
    {optionItem && !isLocked && <CounterOptionsDialog item={optionItem} onClose={() => setOptionItem(null)} onAdd={addOptionLine} />}
    {isDiscarding && <ConfirmationDialog title={uiText('Discard damaged draft')} description={uiText('Check recent orders before discarding a damaged draft to avoid a duplicate order.')} confirmLabel="Discard damaged draft" onCancel={() => setIsDiscarding(false)} onConfirm={() => { discardDamagedDraft(); setIsDiscarding(false) }} />}
  </div>
}

export default NewOrder
