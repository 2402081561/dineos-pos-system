import { useMemo, useRef, useState } from 'react'
import Button from '../common/Button'
import { saveSupabaseCashierTableLayout } from '../../services/adminApiService'
import { floorZone, moveTableToZone, placeTablesOnFloor } from '../../utils/tableFloorLayout'
import { formatCurrency } from '../../utils/currency'
import TableSummaryDialog from './TableSummaryDialog'
import { tableStyle } from '../../../server/src/tableAppearance'
import { layoutHasOverlap, layoutObjects, MARKER_LABELS, overlaps, PLAN_MAX_HEIGHT, TABLE_HEIGHT, TABLE_WIDTH, tablePoint, validPoint } from '../../../server/src/freeFloorLayout'
import FreeFloorCanvas from './FreeFloorCanvas'

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

function TableFloorPlan({ clearableTables, floorTables, floorPlan = { markers: [], revision: 0 }, onClearTable, onOpenTable, paymentTables, onLayoutSaved, onSelectTable, selectedTableId }) {
  const publishedLayout = useMemo(() => placeTablesOnFloor(floorTables), [floorTables])
  const [draftLayout, setDraftLayout] = useState([])
  const [originalPositions, setOriginalPositions] = useState([])
  const [draftMarkers, setDraftMarkers] = useState([])
  const [expectedRevision, setExpectedRevision] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [areaName, setAreaName] = useState('')
  const [summaryId, setSummaryId] = useState(null)
  const [view, setView] = useState('plan')
  const savingRef = useRef(false)
  const visibleLayout = isEditing ? draftLayout : publishedLayout
  const markers = isEditing ? draftMarkers : floorPlan.markers
  const paymentByNumber = useMemo(() => new Map(paymentTables.map((table) => [String(table.tableNumber), table])), [paymentTables])
  const clearableByNumber = useMemo(() => new Map(clearableTables.map((table) => [String(table.tableNumber), table])), [clearableTables])
  const areas = [...new Set([...visibleLayout.map(floorZone), ...markers.map((marker) => marker.zone)])].sort((a, b) => a.localeCompare(b))
  const activeFilter = areas.includes(areaFilter) ? areaFilter : ''
  const displayedAreas = activeFilter ? [activeFilter] : areas
  const selectedTable = draftLayout.find((table) => table.id === selectedId)
  const selectedMarker = draftMarkers.find((marker) => marker.id === selectedId)
  const summaryTable = floorTables.find((table) => table.id === summaryId)
  const summaryPaymentCandidate = summaryTable && paymentByNumber.get(String(summaryTable.tableNumber))
  const summaryPayment = summaryPaymentCandidate?.orders.every((order) => order.tableSessionId === summaryTable.tableSessionId) ? summaryPaymentCandidate : null
  const summaryClearable = summaryTable && clearableByNumber.get(String(summaryTable.tableNumber))

  function tableStatus(table) {
    return clearableByNumber.has(String(table.tableNumber)) ? 'ready_to_clear' : (floorTables.find((current) => current.id === table.id)?.status ?? table.status)
  }

  function beginEditing() {
    setDraftLayout(publishedLayout)
    setDraftMarkers(floorPlan.markers.map((marker) => ({ ...marker })))
    setExpectedRevision(floorPlan.revision)
    setOriginalPositions(floorTables.map((table) => ({ id: table.id, floorX: table.floorX ?? null, floorY: table.floorY ?? null, floorZone: floorZone(table), floorStyle: tableStyle(table.floorStyle), floorPoint: table.floorPoint ?? null })))
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

  function chooseTable(table) {
    if (isEditing) {
      if (isSaving) return
      setSelectedId(table.id)
      setAreaName(floorZone(table))
      return
    }
    if (onSelectTable) onSelectTable(table.id)
    else setSummaryId(table.id)
  }

  function moveObject(id, point) {
    if (!isEditing || isSaving) return
    const nextTables = draftLayout.map((table) => table.id === id ? { ...table, floorPoint: point } : table)
    const nextMarkers = draftMarkers.map((marker) => marker.id === id ? { ...marker, ...point } : marker)
    if (!validPoint(point, draftMarkers.some((marker) => marker.id === id) ? 72 : TABLE_HEIGHT) || layoutHasOverlap(layoutObjects(nextTables, nextMarkers))) {
      setSaveError('This position overlaps another table or marker. Move it to an empty space.')
      return
    }
    setDraftLayout(nextTables)
    setDraftMarkers(nextMarkers)
    setSaveError('')
  }

  function freeSpot(zone, height, tables = draftLayout) {
    const objects = layoutObjects(tables, draftMarkers)
    for (let y = 0; y <= PLAN_MAX_HEIGHT - height; y += 20) {
      for (let x = 0; x <= 1200 - TABLE_WIDTH; x += 20) {
        const candidate = { id: 'new', zone, x, y, height }
        if (!objects.some((object) => overlaps(object, candidate))) return { x, y }
      }
    }
    throw new Error('This area is full. Choose another area.')
  }

  function addMarker(type) {
    try {
      const zone = activeFilter || (selectedTable ? floorZone(selectedTable) : selectedMarker?.zone) || areas[0] || 'Main hall'
      const marker = { id: crypto.randomUUID(), type, zone, ...freeSpot(zone, 72) }
      setDraftMarkers((current) => [...current, marker])
      setSelectedId(marker.id)
      setSaveError('')
    } catch (error) { setSaveError(error.message) }
  }

  function changeArea() {
    if (!selectedId || isSaving) return
    try {
      const name = areaName.trim()
      const canonicalName = areas.find((area) => area.toLocaleLowerCase() === name.toLocaleLowerCase()) ?? name
      const moved = moveTableToZone(draftLayout, selectedId, canonicalName)
      const point = freeSpot(canonicalName, TABLE_HEIGHT, moved.filter((table) => table.id !== selectedId))
      setDraftLayout(moved.map((table) => table.id === selectedId ? { ...table, floorPoint: point } : table))
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
      style: tableStyle(table.floorStyle),
      expectedStyle: expectedById.get(table.id)?.floorStyle,
      point: tablePoint(table),
      expectedPoint: expectedById.get(table.id)?.floorPoint ?? null,
    }))
    try {
      setIsSaving(true)
      setSaveError('')
      const saved = await saveSupabaseCashierTableLayout(positions, { markers: draftMarkers, expectedRevision })
      onLayoutSaved(saved.positions, saved.floorPlan)
      cancelEditing()
    } catch (error) {
      console.error('[Cashier] Failed to save table layout:', error)
      setSaveError(error.message || 'We could not save the floor plan. Please try again.')
    } finally {
      setIsSaving(false)
      savingRef.current = false
    }
  }

  return <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Tables</h2>
        <p className="mt-1 text-xs text-slate-500">Select a table to view its bill.</p>
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
    {isEditing && <div className="mt-4 rounded-xl bg-orange-50 p-3"><p className="text-sm text-orange-900">Drag tables and markers to match your shop. Changes are saved only when you press Save layout.</p><div className="mt-3 flex flex-wrap gap-2">{Object.entries(MARKER_LABELS).map(([type, label]) => <button key={type} type="button" disabled={isSaving} onClick={() => addMarker(type)} className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold">+ {label}</button>)}</div></div>}
    {areas.length > 0 && <div aria-label="Filter tables by area" className="mt-4 flex flex-wrap gap-2" role="group">
      {['', ...areas].map((area) => <button aria-pressed={activeFilter === area} className={`max-w-full break-words rounded-full px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400 ${activeFilter === area ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`} key={area || 'all'} onClick={() => { setAreaFilter(area); setSelectedId(null) }} type="button">{area || 'All areas'}</button>)}
    </div>}
    {isEditing && selectedTable && <div className="order-2 mt-4 rounded-2xl border border-orange-200 p-4">
      <label className="text-sm font-bold" htmlFor="floor-table-area">Area for Table {selectedTable.tableNumber}</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" disabled={isSaving} id="floor-table-area" list="floor-area-options" maxLength={40} onChange={(event) => setAreaName(event.target.value)} placeholder="e.g. Main hall, Outdoor, Private room" value={areaName} />
        <datalist id="floor-area-options">{[...new Set([...areas, 'Main hall', 'Outdoor', 'Private room'])].map((area) => <option key={area} value={area} />)}</datalist>
        <Button disabled={isSaving} onClick={changeArea} variant="outline">Move to area</Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Choose an existing area or enter a new name, then save the layout.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">{[
        ['shape', 'Shape', [['round', 'Round'], ['square', 'Square'], ['rectangle', 'Long table']]],
        ['size', 'Size', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]],
        ['orientation', 'Direction', [['horizontal', 'Horizontal'], ['vertical', 'Vertical']]],
      ].map(([field, label, options]) => <label key={field} className="text-sm font-semibold">{label}<select className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2" disabled={isSaving || (field === 'orientation' && tableStyle(selectedTable.floorStyle).shape !== 'rectangle')} value={tableStyle(selectedTable.floorStyle)[field]} onChange={(event) => setDraftLayout((current) => current.map((table) => table.id === selectedId ? { ...table, floorStyle: { ...tableStyle(table.floorStyle), [field]: event.target.value } } : table))}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}</div>
      <p className="mt-2 text-xs text-slate-500">Drag this table freely on the plan. Tables and markers must not overlap.</p>
    </div>}
    {isEditing && selectedMarker && <div className="order-2 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><p className="text-sm font-bold">{MARKER_LABELS[selectedMarker.type]} · {selectedMarker.zone}</p><button type="button" disabled={isSaving} onClick={() => { setDraftMarkers((current) => current.filter((marker) => marker.id !== selectedId)); setSelectedId(null) }} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">Remove marker</button></div>}
    {saveError && <p aria-live="assertive" className="order-2 mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
    {!isEditing && view === 'cards' ? <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {visibleLayout.filter((table) => !activeFilter || floorZone(table) === activeFilter).map((table) => <button type="button" key={table.id} aria-pressed={selectedTableId === table.id} onClick={() => chooseTable(table)} className={`min-w-0 rounded-2xl border p-4 text-left focus:outline-none focus:ring-2 focus:ring-orange-500 ${tileStyles[tableStatus(table)] ?? tileStyles.inactive} ${selectedTableId === table.id ? 'ring-2 ring-orange-500' : ''}`}>
        <span className="block text-lg font-extrabold">Table {table.tableNumber}</span>
        <span className="mt-2 block text-xs font-semibold">{statusLabels[tableStatus(table)]}</span>
        <span className="mt-3 block text-xs">{table.unpaidOrderCount ?? 0} unpaid orders</span>
        <span className="mt-1 block font-bold">{formatCurrency(table.unpaidTotal)}</span>
      </button>)}
      {floorTables.length === 0 && <p className="col-span-2 text-sm text-slate-500">No tables configured.</p>}
    </div> : floorTables.length === 0 ? <p className="mt-5 rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">No tables have been configured yet.</p> : displayedAreas.map((area) => <FreeFloorCanvas
      area={area} editing={isEditing} disabled={isSaving} key={`${area}-${isEditing}`}
      onMove={moveObject} onSelectTable={chooseTable} onSelectMarker={(marker) => setSelectedId(marker.id)}
      selectedId={isEditing ? selectedId : selectedTableId} tables={visibleLayout.filter((table) => floorZone(table) === area)}
      markers={markers.filter((marker) => marker.zone === area)}
      renderTable={(table) => <><span className="flex h-28 w-full items-center justify-center"><TableShape table={table} status={tableStatus(table)} /></span><span className="text-[11px] font-semibold leading-tight text-slate-600">{statusLabels[tableStatus(table)] ?? 'Available'}</span><span className="mt-1 text-xs font-bold text-slate-800">{formatCurrency(table.unpaidTotal)}</span></>}
    />)}
    {summaryId && <TableSummaryDialog table={summaryTable} statusLabel={summaryTable ? statusLabels[tableStatus(summaryTable)] : ''} payment={summaryPayment} clearable={summaryClearable} onClose={() => setSummaryId(null)} onOpenTable={onOpenTable} onClearTable={onClearTable} />}
  </section>
}

function TableShape({ table, status }) {
  const style = tableStyle(table.floorStyle)
  const dimensions = style.shape === 'rectangle'
    ? (style.orientation === 'vertical' ? 'h-[104px] w-16 rounded-xl' : 'h-16 w-[120px] rounded-xl')
    : style.shape === 'round' ? 'h-24 w-24 rounded-full' : 'h-24 w-24 rounded-xl'
  const scale = { small: 0.7, medium: 0.85, large: 1 }[style.size]
  return <span style={{ transform: `scale(${scale})` }} className={`flex shrink-0 items-center justify-center border-2 text-lg font-bold ${dimensions} ${tileStyles[status] ?? tileStyles.available}`}>T{table.tableNumber}</span>
}

export default TableFloorPlan
