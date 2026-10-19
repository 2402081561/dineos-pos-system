import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useEffect, useRef, useState } from 'react'
import { MARKER_HEIGHT, MARKER_LABELS, PLAN_MAX_HEIGHT, PLAN_WIDTH, TABLE_HEIGHT, TABLE_WIDTH, tablePoint } from '../../../server/src/freeFloorLayout'

export default function FreeFloorCanvas({ area, tables, markers, editing, disabled, selectedId, onSelectTable, onSelectMarker, onMove, renderTable }) {
  const { t: uiText } = useCustomerLanguage()

  const viewport = useRef(null)
  const canvas = useRef(null)
  const gesture = useRef(null)
  const [preview, setPreview] = useState(null)
  const [width, setWidth] = useState(1200)
  const [zoom, setZoom] = useState('1')
  const [extraHeight, setExtraHeight] = useState(0)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(viewport.current)
    return () => observer.disconnect()
  }, [])
  const objects = [
    ...tables.map((table) => ({ id: table.id, point: tablePoint(table), height: TABLE_HEIGHT, table })),
    ...markers.map((marker) => ({ id: marker.id, point: { x: marker.x, y: marker.y }, height: MARKER_HEIGHT, marker })),
  ]
  const height = Math.min(PLAN_MAX_HEIGHT, Math.max(600, extraHeight, ...objects.map((object) => object.point.y + object.height + 30)))
  const scale = zoom === 'fit' ? Math.min(1, width / PLAN_WIDTH) : Number(zoom)

  function start(event, object) {
    if (!editing || disabled || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { id: object.id, startX: event.clientX, startY: event.clientY, origin: object.point, height: object.height, moved: false, next: object.point }
    if (object.table) onSelectTable(object.table)
    else onSelectMarker(object.marker)
  }
  function move(event) {
    const drag = gesture.current
    if (!drag) return
    const dx = (event.clientX - drag.startX) / scale, dy = (event.clientY - drag.startY) / scale
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
    drag.next = {
      x: Math.round(Math.max(0, Math.min(PLAN_WIDTH - TABLE_WIDTH, drag.origin.x + dx))),
      y: Math.round(Math.max(0, Math.min(height - drag.height, drag.origin.y + dy))),
    }
    setPreview({ id: drag.id, ...drag.next })
  }
  function end() {
    const drag = gesture.current
    gesture.current = null
    setPreview(null)
    if (drag?.moved) onMove(drag.id, drag.next)
  }
  function abort() { gesture.current = null; setPreview(null) }
  function keyboard(event, object) {
    if (!editing || disabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const step = event.shiftKey ? 20 : 5
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    onMove(object.id, { x: Math.max(0, Math.min(PLAN_WIDTH - TABLE_WIDTH, object.point.x + dx)), y: Math.max(0, Math.min(height - object.height, object.point.y + dy)) })
  }
  return <section className="order-1 mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
    <header className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-700">{area}</h3><label className="text-xs text-slate-500">{uiText("Zoom")}<select className="ml-2 rounded-md border bg-white p-1" value={zoom} onChange={(event) => setZoom(event.target.value)}><option value="fit">{uiText("Fit")}</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option></select></label></header>
    <div ref={viewport} className="overflow-auto rounded-lg border border-slate-200" style={{ maxHeight: 620 }}>
      <div style={{ width: PLAN_WIDTH * scale, height: height * scale }}>
        <div ref={canvas} role="group" aria-label={uiText("{{v0}} free floor plan", { v0: area })} className="relative bg-white" style={{ width: PLAN_WIDTH, height, transform: `scale(${scale})`, transformOrigin: 'top left', backgroundImage: editing ? 'radial-gradient(#cbd5e1 1px, transparent 1px)' : undefined, backgroundSize: '20px 20px' }}>
          {objects.map((object) => {
            const point = preview?.id === object.id ? preview : object.point
            return <button key={object.id} type="button" disabled={disabled} aria-label={object.table ? `Table ${object.table.tableNumber}${editing ? uiText(", move table") : uiText(", view bill")}` : MARKER_LABELS[object.marker.type]} aria-pressed={selectedId === object.id} className={`absolute flex flex-col items-center justify-center rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 ${selectedId === object.id ? 'ring-2 ring-orange-500' : ''} ${editing ? 'cursor-grab active:cursor-grabbing' : object.marker ? 'cursor-default' : 'hover:bg-slate-50'}`} style={{ left: point.x, top: point.y, width: TABLE_WIDTH, height: object.height, touchAction: editing ? 'none' : 'auto', userSelect: 'none' }} onPointerDown={(event) => start(event, object)} onPointerMove={move} onPointerUp={end} onPointerCancel={abort} onLostPointerCapture={abort} onKeyDown={(event) => keyboard(event, object)} onClick={() => {
              if (editing) { if (object.table) onSelectTable(object.table); else onSelectMarker(object.marker) }
              else if (object.table) onSelectTable(object.table)
            }}>
              {object.table ? renderTable(object.table) : <span className="flex h-full w-full items-center justify-center rounded-lg border-2 border-slate-300 bg-slate-100 px-2 text-center text-sm font-bold text-slate-700">{uiText(MARKER_LABELS[object.marker.type])}</span>}
            </button>
          })}
        </div>
      </div>
    </div>
    {editing ? <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold" disabled={disabled || height >= PLAN_MAX_HEIGHT} onClick={() => setExtraHeight(Math.min(PLAN_MAX_HEIGHT, height + 200))}>{uiText("Add space below")}</button><p className="text-xs text-slate-500">{uiText("Drag to move · Arrow keys: 5px · Shift + arrows: 20px")}</p></div> : <p className="mt-2 text-xs text-slate-500">{uiText("Layout locked. Select a table to view its bill. Scroll to see more.")}</p>}
  </section>
}
