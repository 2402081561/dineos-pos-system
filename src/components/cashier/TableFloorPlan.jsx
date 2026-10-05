import { useMemo, useRef, useState } from 'react'
import Button from '../common/Button'
import { saveSupabaseCashierTableLayout } from '../../services/adminApiService'
import { FLOOR_COLUMNS, FLOOR_MAX_ROWS, floorZone, moveTableOnFloor, moveTableToZone, placeTablesOnFloor } from '../../utils/tableFloorLayout'
import { formatCurrency } from '../../utils/currency'
import TableSummaryDialog from './TableSummaryDialog'

const statusLabels = {
  available: 'Available',
  occupied: 'Occupied',
  ordering: 'Ordering',
  awaiting_payment: 'Payment due',
  ready_to_clear: 'Ready to clear',
  inactive: 'Disabled',
}

const tileStyles = {
  available: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  occupied: 'border-amber-200 bg-amber-50 text-amber-900',
  ordering: 'border-sky-200 bg-sky-50 text-sky-900',
  awaiting_payment: 'border-orange-300 bg-orange-50 text-orange-950',
  ready_to_clear: 'border-violet-200 bg-violet-50 text-violet-900',
  inactive: 'border-slate-200 bg-slate-100 text-slate-500',
}

function TableFloorPlan({ clearableTables, floorTables, onClearTable, onOpenTable, paymentTables, onLayoutSaved, onSelectTable, selectedTableId }) {
  const publishedLayout = useMemo(() => placeTablesOnFloor(floorTables), [floorTables])
  const [draftLayout, setDraftLayout] = useState([])
  const [originalPositions, setOriginalPositions] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [areaName, setAreaName] = useState('')
  const [summaryId, setSummaryId] = useState(null)
  const [view, setView] = useState('cards')
  const savingRef = useRef(false)
  const visibleLayout = isEditing ? draftLayout : publishedLayout
  const paymentByNumber = useMemo(() => new Map(paymentTables.map((table) => [String(table.tableNumber), table])), [paymentTables])
  const clearableByNumber = useMemo(() => new Map(clearableTables.map((table) => [String(table.tableNumber), table])), [clearableTables])
  const areas = [...new Set(visibleLayout.map(floorZone))].sort((a, b) => a.localeCompare(b))
  const activeFilter = areas.includes(areaFilter) ? areaFilter : ''
  const displayedAreas = activeFilter ? [activeFilter] : areas
  const selectedTable = draftLayout.find((table) => table.id === selectedId)
  const summaryTable = floorTables.find((table) => table.id === summaryId)
  const summaryPaymentCandidate = summaryTable && paymentByNumber.get(String(summaryTable.tableNumber))
  const summaryPayment = summaryPaymentCandidate?.orders.every((order) => order.tableSessionId === summaryTable.tableSessionId) ? summaryPaymentCandidate : null
  const summaryClearable = summaryTable && clearableByNumber.get(String(summaryTable.tableNumber))

  function tableStatus(table) {
    return clearableByNumber.has(String(table.tableNumber)) ? 'ready_to_clear' : (floorTables.find((current) => current.id === table.id)?.status ?? table.status)
  }

  function beginEditing() {
    setDraftLayout(publishedLayout)
    setOriginalPositions(floorTables.map((table) => ({ id: table.id, floorX: table.floorX ?? null, floorY: table.floorY ?? null, floorZone: floorZone(table) })))
    setSelectedId(null)
    setSaveError('')
    setIsEditing(true)
  }

  function cancelEditing() {
    setIsEditing(false)
    setSelectedId(null)
    setSaveError('')
    setDraftLayout([])
  }

  function chooseCell(x, y) {
    if (!selectedId || isSaving) return
    setDraftLayout((current) => moveTableOnFloor(current, selectedId, x, y))
    setSelectedId(null)
    setSaveError('')
  }

  function chooseTable(table) {
    if (isEditing) {
      if (isSaving) return
      if (!selectedId || selectedId === table.id || floorZone(selectedTable) !== floorZone(table)) {
        setSelectedId(selectedId === table.id ? null : table.id)
        setAreaName(floorZone(table))
      } else {
        chooseCell(table.x, table.y)
      }
      return
    }
    if (onSelectTable) onSelectTable(table.id)
    else setSummaryId(table.id)
  }

  function changeArea() {
    if (!selectedId || isSaving) return
    try {
      const name = areaName.trim()
      const canonicalName = areas.find((area) => area.toLocaleLowerCase() === name.toLocaleLowerCase()) ?? name
      setDraftLayout(moveTableToZone(draftLayout, selectedId, canonicalName))
      setAreaFilter(canonicalName)
      setAreaName(canonicalName)
      setSaveError('')
    } catch (error) { setSaveError(error.message) }
  }

  async function saveLayout() {
    if (savingRef.current) return
    savingRef.current = true
    const expectedById = new Map(originalPositions.map((position) => [position.id, position]))
    const positions = draftLayout.map((table) => ({
      tableId: table.id,
      x: table.x,
      y: table.y,
      zone: floorZone(table),
      expectedX: expectedById.get(table.id)?.floorX ?? null,
      expectedY: expectedById.get(table.id)?.floorY ?? null,
      expectedZone: expectedById.get(table.id)?.floorZone,
    }))
    try {
      setIsSaving(true)
      setSaveError('')
      const saved = await saveSupabaseCashierTableLayout(positions)
      onLayoutSaved(saved.positions)
      cancelEditing()
    } catch (error) {
      console.error('[Cashier] Failed to save table layout:', error)
      setSaveError(error.message || 'We could not save the floor plan. Please try again.')
    } finally {
      setIsSaving(false)
      savingRef.current = false
    }
  }

  return <section className="surface-card overflow-hidden p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="eyebrow">Restaurant floor</p>
        <h2 className="mt-1 text-xl font-extrabold text-slate-900">Table layout</h2>
        <p className="mt-1 text-sm text-slate-500">Select any table to see its orders and payment summary.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!isEditing && <Button onClick={() => setView(view === 'cards' ? 'plan' : 'cards')} variant="outline">{view === 'cards' ? 'Floor plan' : 'Table cards'}</Button>}
        {isEditing ? <>
          <Button disabled={isSaving} onClick={cancelEditing} variant="outline">Cancel</Button>
          <Button disabled={isSaving || draftLayout.length === 0} isLoading={isSaving} onClick={saveLayout}>Save layout</Button>
        </> : <Button disabled={floorTables.length === 0} onClick={beginEditing} variant="outline">Edit layout</Button>}
      </div>
    </div>
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-600">
      {['available', 'occupied', 'ordering', 'awaiting_payment', 'ready_to_clear', 'inactive'].map((status) => <span className="inline-flex items-center gap-1.5" key={status}><span className={`h-2.5 w-2.5 rounded-full border ${tileStyles[status]}`} />{statusLabels[status]}</span>)}
    </div>
    {isEditing && <p aria-live="polite" className="mt-4 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">{selectedId ? 'Now choose an empty space or another table to swap positions.' : 'Select a table, then choose where to place it. Changes are saved only when you press Save layout.'}</p>}
    {areas.length > 0 && <div aria-label="Filter tables by area" className="mt-4 flex flex-wrap gap-2" role="group">
      {['', ...areas].map((area) => <button aria-pressed={activeFilter === area} className={`max-w-full break-words rounded-full px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400 ${activeFilter === area ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`} key={area || 'all'} onClick={() => { setAreaFilter(area); setSelectedId(null) }} type="button">{area || 'All areas'}</button>)}
    </div>}
    {isEditing && selectedTable && <div className="mt-4 rounded-2xl border border-orange-200 p-4">
      <label className="text-sm font-bold" htmlFor="floor-table-area">Area for Table {selectedTable.tableNumber}</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" disabled={isSaving} id="floor-table-area" list="floor-area-options" maxLength={40} onChange={(event) => setAreaName(event.target.value)} placeholder="e.g. Main hall, Outdoor, Private room" value={areaName} />
        <datalist id="floor-area-options">{[...new Set([...areas, 'Main hall', 'Outdoor', 'Private room'])].map((area) => <option key={area} value={area} />)}</datalist>
        <Button disabled={isSaving} onClick={changeArea} variant="outline">Move to area</Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Choose an existing area or enter a new name, then save the layout.</p>
    </div>}
    {saveError && <p aria-live="assertive" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
    {!isEditing && view === 'cards' ? <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {visibleLayout.filter((table) => !activeFilter || floorZone(table) === activeFilter).map((table) => <button type="button" key={table.id} aria-pressed={selectedTableId === table.id} onClick={() => chooseTable(table)} className={`min-w-0 rounded-2xl border p-4 text-left focus:outline-none focus:ring-2 focus:ring-orange-500 ${tileStyles[tableStatus(table)] ?? tileStyles.inactive} ${selectedTableId === table.id ? 'ring-2 ring-orange-500' : ''}`}>
        <span className="block text-lg font-extrabold">Table {table.tableNumber}</span>
        <span className="mt-2 block text-xs font-semibold">{statusLabels[tableStatus(table)]}</span>
        <span className="mt-3 block text-xs">{table.unpaidOrderCount ?? 0} unpaid orders</span>
        <span className="mt-1 block font-bold">{formatCurrency(table.unpaidTotal)}</span>
      </button>)}
      {floorTables.length === 0 && <p className="col-span-2 text-sm text-slate-500">No tables configured.</p>}
    </div> : floorTables.length === 0 ? <p className="mt-5 rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">No tables have been configured yet.</p> : displayedAreas.map((area) => <FloorArea
      area={area} getStatus={tableStatus} isEditing={isEditing} isSaving={isSaving} key={`${area}-${isEditing}`}
      onChooseCell={chooseCell} onChooseTable={chooseTable} paymentByNumber={paymentByNumber}
      selectedId={selectedId} selectedArea={selectedTable && floorZone(selectedTable)} tables={visibleLayout.filter((table) => floorZone(table) === area)}
    />)}
    {!isEditing && view === 'plan' && <p className="mt-3 text-xs text-slate-500">On a phone, swipe sideways to see the full floor plan.</p>}
    {summaryId && <TableSummaryDialog table={summaryTable} statusLabel={summaryTable ? statusLabels[tableStatus(summaryTable)] : ''} payment={summaryPayment} clearable={summaryClearable} onClose={() => setSummaryId(null)} onOpenTable={onOpenTable} onClearTable={onClearTable} />}
  </section>
}

function FloorArea({ area, tables, isEditing, isSaving, selectedId, selectedArea, onChooseCell, onChooseTable, paymentByNumber, getStatus }) {
  const [extraRows, setExtraRows] = useState(0)
  const tableByCell = new Map(tables.map((table) => [`${table.x}:${table.y}`, table]))
  const highestRow = tables.reduce((highest, table) => Math.max(highest, table.y ?? 0), 0)
  const rowCount = Math.min(FLOOR_MAX_ROWS, Math.max(2, Math.ceil(tables.length / FLOOR_COLUMNS) + 1, highestRow + 2, extraRows))
  return <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
    <div className="mb-3 flex items-center justify-between gap-3"><h3 className="break-words font-bold text-slate-700">{area}</h3><span className="shrink-0 text-xs text-slate-500">{tables.length} tables</span></div>
    <div className="overflow-x-auto pb-1">
      <div aria-label={`${area} floor plan`} className="grid min-w-[800px] grid-cols-8 gap-2" role="group">
        {Array.from({ length: rowCount * FLOOR_COLUMNS }, (_, index) => {
          const x = index % FLOOR_COLUMNS
          const y = Math.floor(index / FLOOR_COLUMNS)
          const table = tableByCell.get(`${x}:${y}`)
          if (!table) return isEditing
            ? <button aria-label={`${area}, empty position, column ${x + 1}, row ${y + 1}`} className="min-h-24 rounded-2xl border border-dashed border-slate-300 bg-white/70 hover:border-orange-400 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-400" disabled={!selectedId || selectedArea !== area || isSaving} key={`cell-${index}`} onClick={() => onChooseCell(x, y)} type="button" />
            : <div aria-hidden="true" className="min-h-24 rounded-2xl border border-dashed border-slate-200 bg-white/50" key={`cell-${index}`} />
          const status = getStatus(table)
          const payment = paymentByNumber.get(String(table.tableNumber))
          return <button
            aria-label={`Table ${table.tableNumber}, ${statusLabels[status] ?? 'available'}${isEditing ? ', select position' : ', view summary'}`}
            aria-pressed={isEditing ? selectedId === table.id : undefined}
            className={`flex min-h-24 flex-col justify-between rounded-2xl border p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-400 ${tileStyles[status] ?? tileStyles.available} ${selectedId === table.id ? 'ring-2 ring-orange-500' : ''}`}
            disabled={isSaving} key={table.id} onClick={() => onChooseTable(table)} type="button"
          ><span className="text-lg font-extrabold leading-tight">Table {table.tableNumber}</span><span className="mt-1 text-[11px] font-semibold leading-tight">{statusLabels[status] ?? 'Available'}{payment ? ` · ${formatCurrency(payment.grandTotal)}` : ''}</span></button>
        })}
      </div>
    </div>
    {isEditing && rowCount < FLOOR_MAX_ROWS && <Button className="mt-3" disabled={isSaving} onClick={() => setExtraRows(rowCount + 1)} variant="outline">Add a row</Button>}
  </div>
}

export default TableFloorPlan
