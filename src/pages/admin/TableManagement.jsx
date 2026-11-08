import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useMemo, useState } from 'react'
import Button from '../../components/common/Button'
import ConfirmationDialog from '../../components/common/ConfirmationDialog'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import TableFormModal from '../../components/admin/TableFormModal'
import TableQrModal from '../../components/admin/TableQrModal'
import TakeawayQrCard from '../../components/admin/TakeawayQrCard'
import useToast from '../../hooks/useToast'
import useOperationalTables from '../../hooks/useOperationalTables'
import { tableStatusLabel } from '../../utils/tableStatusPresentation'
import { clearSupabaseAdminTable as clearCompletedTableSession, createSupabaseAdminTable as createTable, deleteSupabaseAdminTable as deleteTable, updateSupabaseAdminTable as updateTable } from '../../services/adminApiService'

const statusStyles = {
  available: 'bg-emerald-50 text-emerald-700',
  occupied: 'bg-amber-50 text-amber-700',
  ordering: 'bg-blue-50 text-blue-700',
  awaiting_payment: 'bg-orange-50 text-orange-700',
  ready_to_clear: 'bg-sky-50 text-sky-700',
  inactive: 'bg-slate-100 text-slate-500',
}

function TableStatusBadge({ status }) {
  const { t: uiText } = useCustomerLanguage()
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[status] ?? statusStyles.available}`}>
      {uiText(tableStatusLabel(status))}
    </span>
  )
}

function ActiveBadge({ isActive }) {
  const { t: uiText } = useCustomerLanguage()

  const active = isActive !== false

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      {active ? uiText("Active") : uiText("Inactive")}
    </span>
  )
}

function TableActions({ canClear, isClearing, onClear, onDelete, onEdit, onQr }) {
  const { t: uiText } = useCustomerLanguage()

  return (
    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
      <Button className="px-3 py-2 text-xs" onClick={onQr} variant="secondary">{uiText("QR code")}</Button>
      {canClear && <Button className="px-3 py-2 text-xs" disabled={isClearing} onClick={onClear} variant="outline">{isClearing ? uiText("Clearing...") : uiText("Clear table")}</Button>}
      <Button className="px-3 py-2 text-xs" onClick={onEdit} variant="outline">{uiText("Edit")}</Button>
      <Button className="px-3 py-2 text-xs" onClick={onDelete} variant="danger">{uiText("Delete")}</Button>
    </div>
  )
}

function TableManagement() {
  const { t: uiText } = useCustomerLanguage()

  const { showToast } = useToast()
  const { tables, isLoading, error } = useOperationalTables()
  const [actionError, setActionError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [editingTable, setEditingTable] = useState(null)
  const [deletingTable, setDeletingTable] = useState(null)
  const [qrTable, setQrTable] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [clearingTable, setClearingTable] = useState(null)
  const [isClearing, setIsClearing] = useState(false)

  const filteredTables = useMemo(
    () => tables.filter((table) => String(table.tableNumber).includes(searchTerm.trim())),
    [tables, searchTerm],
  )

  function openCreateForm() {
    setActionError('')
    setEditingTable(null)
    setIsFormOpen(true)
  }

  function openEditForm(table) {
    setActionError('')
    setEditingTable(table)
    setIsFormOpen(true)
  }

  async function handleSave(table) {
    const tableNumber = Number(table.tableNumber)
    const capacity = Number(table.capacity)

    if (!Number.isInteger(tableNumber) || tableNumber < 1) {
      setActionError('Table number is required.')
      return
    }
    if (!Number.isFinite(capacity) || capacity <= 0) {
      setActionError('Capacity must be greater than zero.')
      return
    }
    if (tables.some((existingTable) => existingTable.id !== editingTable?.id && Number(existingTable.tableNumber) === tableNumber)) {
      setActionError('A table with this number already exists.')
      return
    }

    try {
      setIsSubmitting(true)
      setActionError('')
      if (editingTable) {
        await updateTable(editingTable.id, table)
        showToast('Table updated.')
      } else {
        await createTable(table)
        showToast('Table created.')
      }
      setEditingTable(null)
      setIsFormOpen(false)
    } catch (firebaseError) {
      console.error('[Table Management] Failed to save table:', firebaseError)
      setActionError('We could not save this table. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete() {
    try {
      setIsSubmitting(true)
      setActionError('')
      await deleteTable(deletingTable.id)
      showToast('Table deleted.')
      setDeletingTable(null)
    } catch (firebaseError) {
      console.error('[Table Management] Failed to delete table:', firebaseError)
      setActionError('We could not delete this table. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleClearTable() {
    if (!clearingTable || isClearing) return
    try {
      setIsClearing(true)
      setActionError('')
      await clearCompletedTableSession(clearingTable.id)
      showToast(`Table ${clearingTable.tableNumber} is available for the next customer.`)
      setClearingTable(null)
    } catch (firebaseError) {
      console.error('[Table Management] Failed to clear table:', firebaseError)
      setActionError(firebaseError instanceof Error ? firebaseError.message : 'We could not clear this table. Please try again.')
      setClearingTable(null)
    } finally {
      setIsClearing(false)
    }
  }

  if (isLoading) {
    return <div className="space-y-6 animate-pulse"><div className="h-20 rounded-2xl bg-slate-200" /><div className="surface-card h-96 bg-white" /></div>
  }

  if (error) return <StatePanel description={uiText(error)} title={uiText("Table management unavailable")} tone="error" />

  return (
    <div className="space-y-6">
      <SectionHeading
        action={<Button className="w-full sm:w-auto" onClick={openCreateForm}>{uiText("+ Add table")}</Button>}
        description={uiText("Set up your dining areas and their QR ordering access.")}
        eyebrow={uiText("Administration")}
        title={uiText("Manage tables")}
      />

      <TakeawayQrCard />
      {actionError && <p className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">{actionError}</p>}

      <section className="surface-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="relative w-full sm:max-w-xs">
            <label className="sr-only" htmlFor="table-search">{uiText("Search table number")}</label>
            <span aria-hidden="true" className="absolute left-3 top-2.5 text-slate-400">⌕</span>
            <input
              className="w-full rounded-xl bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-orange-400"
              id="table-search"
              inputMode="numeric"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={uiText("Search table number")}
              value={searchTerm}
            />
          </div>
          <p className="text-sm font-medium text-slate-500">{filteredTables.length} {filteredTables.length === 1 ? uiText("table") : uiText("tables")}</p>
        </div>

        {filteredTables.length === 0 ? (
          <div className="p-8">
            <StatePanel
              description={tables.length === 0 ? uiText("Add your first table to create its QR ordering access.") : uiText("Try another table number.")}
              title={tables.length === 0 ? uiText("No tables yet.") : uiText("No matching tables.")}
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-3.5 font-bold">{uiText("Table number")}</th>
                    <th className="px-5 py-3.5 font-bold">{uiText("Capacity")}</th>
                    <th className="px-5 py-3.5 font-bold">{uiText("Current status")}</th>
                    <th className="px-5 py-3.5 font-bold">{uiText("Current activity")}</th>
                    <th className="px-5 py-3.5 font-bold">{uiText("Active")}</th>
                    <th className="px-5 py-3.5 text-right font-bold">{uiText("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTables.map((table) => (
                    <tr className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80" key={table.id}>
                      <td className="px-5 py-4 font-semibold text-slate-900">{uiText("Table")}{' '}{table.tableNumber}</td>
                      <td className="px-5 py-4 text-slate-600">{table.capacity}{' '}{uiText("seats")}</td>
                      <td className="px-5 py-4"><TableStatusBadge status={table.status} /></td>
                      <td className="px-5 py-4 text-slate-600">{table.status === 'occupied' ? `${table.participantCount} customer${table.participantCount === 1 ? '' : 's'}` : table.status === 'awaiting_payment' ? `RM ${table.unpaidTotal.toFixed(2)} unpaid` : table.status === 'ordering' ? `${table.tableOrders.length} active order${table.tableOrders.length === 1 ? '' : 's'}` : table.status === 'ready_to_clear' ? uiText("Ready for turnover") : uiText("No active session")}</td>
                      <td className="px-5 py-4"><ActiveBadge isActive={table.isActive} /></td>
                      <td className="px-5 py-4"><TableActions canClear={table.status === 'ready_to_clear'} isClearing={isClearing && clearingTable?.id === table.id} onClear={() => setClearingTable(table)} onDelete={() => setDeletingTable(table)} onEdit={() => openEditForm(table)} onQr={() => setQrTable(table)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 p-3 sm:grid-cols-2 lg:hidden">
              {filteredTables.map((table) => (
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" key={table.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-base font-extrabold text-orange-600">{table.tableNumber}</span>
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-bold text-slate-900">{uiText("Table")}{' '}{table.tableNumber}</h2>
                        <p className="mt-0.5 text-sm text-slate-500">{table.capacity}{' '}{uiText("seats")}</p>
                      </div>
                    </div>
                    <Button aria-label={uiText("Show QR code for Table {{v0}}", { v0: table.tableNumber })} className="shrink-0 px-3 py-2 text-xs" onClick={() => setQrTable(table)} variant="secondary">{uiText("QR")}</Button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-100 py-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{uiText("Status")}</p>
                      <div className="mt-1.5"><TableStatusBadge status={table.status} /></div>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{uiText("Availability")}</p>
                      <div className="mt-1.5"><ActiveBadge isActive={table.isActive} /></div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button className="w-full px-3 py-2 text-xs" onClick={() => openEditForm(table)} variant="outline">{uiText("Edit table")}</Button>
                    <Button className="w-full px-3 py-2 text-xs" onClick={() => setDeletingTable(table)} variant="danger">{uiText("Delete")}</Button>
                  </div>
                  {table.status === 'ready_to_clear' && <Button className="mt-2 w-full px-3 py-2 text-xs" disabled={isClearing} onClick={() => setClearingTable(table)} variant="secondary">{uiText("Clear table")}</Button>}
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {isFormOpen && <TableFormModal error={actionError} initialTable={editingTable} isSubmitting={isSubmitting} onCancel={() => { if (!isSubmitting) { setIsFormOpen(false); setEditingTable(null) } }} onSubmit={handleSave} />}
      {deletingTable && <ConfirmationDialog confirmLabel="Delete table" description={uiText("Delete Table {{v0}}? This cannot be undone.", { v0: deletingTable.tableNumber })} isLoading={isSubmitting} onCancel={() => { if (!isSubmitting) setDeletingTable(null) }} onConfirm={handleDelete} title={uiText("Delete table")} />}
      {clearingTable && <ConfirmationDialog confirmLabel="Clear table" description={uiText("Clear Table {{v0}}? The completed table session will be ended and the table will become available for the next customer. Historical orders and payment records will remain.", { v0: clearingTable.tableNumber })} isLoading={isClearing} onCancel={() => { if (!isClearing) setClearingTable(null) }} onConfirm={handleClearTable} title={uiText("Clear Table {{v0}}?", { v0: clearingTable.tableNumber })} />}
      {qrTable && <TableQrModal onClose={() => setQrTable(null)} table={qrTable} />}
    </div>
  )
}

export default TableManagement
