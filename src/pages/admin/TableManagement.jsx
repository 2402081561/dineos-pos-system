import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/common/Button'
import ConfirmationDialog from '../../components/common/ConfirmationDialog'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import TableFormModal from '../../components/admin/TableFormModal'
import TableQrModal from '../../components/admin/TableQrModal'
import useToast from '../../hooks/useToast'
import {
  createTable,
  deleteTable,
  hasActiveOrdersForTable,
  subscribeToTables,
  updateTable,
} from '../../services/tableService'

function formatTableStatus(status) {
  return String(status ?? 'available').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function TableStatusBadge({ status }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
      {formatTableStatus(status)}
    </span>
  )
}

function ActiveBadge({ isActive }) {
  const active = isActive !== false

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function TableActions({ onDelete, onEdit, onQr }) {
  return (
    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
      <Button className="px-3 py-2 text-xs" onClick={onQr} variant="secondary">QR code</Button>
      <Button className="px-3 py-2 text-xs" onClick={onEdit} variant="outline">Edit</Button>
      <Button className="px-3 py-2 text-xs" onClick={onDelete} variant="danger">Delete</Button>
    </div>
  )
}

function TableManagement() {
  const { showToast } = useToast()
  const [tables, setTables] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [editingTable, setEditingTable] = useState(null)
  const [deletingTable, setDeletingTable] = useState(null)
  const [qrTable, setQrTable] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => subscribeToTables(
    (tableData) => {
      setTables(tableData)
      setIsLoading(false)
    },
    (firebaseError) => {
      console.error('[Table Management] Failed to load tables:', firebaseError)
      setError('We could not load tables right now. Please try again shortly.')
      setIsLoading(false)
    },
  ), [])

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
      if (await hasActiveOrdersForTable(deletingTable.id)) {
        setDeletingTable(null)
        setActionError('This table currently has active orders.')
        return
      }
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

  if (isLoading) {
    return <div className="space-y-6 animate-pulse"><div className="h-20 rounded-2xl bg-slate-200" /><div className="surface-card h-96 bg-white" /></div>
  }

  if (error) return <StatePanel description={error} title="Table management unavailable" tone="error" />

  return (
    <div className="space-y-6">
      <SectionHeading
        action={<Button className="w-full sm:w-auto" onClick={openCreateForm}>+ Add table</Button>}
        description="Set up your dining areas and their QR ordering access."
        eyebrow="Administration"
        title="Manage tables"
      />

      {actionError && <p className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">{actionError}</p>}

      <section className="surface-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="relative w-full sm:max-w-xs">
            <label className="sr-only" htmlFor="table-search">Search table number</label>
            <span aria-hidden="true" className="absolute left-3 top-2.5 text-slate-400">⌕</span>
            <input
              className="w-full rounded-xl bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-orange-400"
              id="table-search"
              inputMode="numeric"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search table number"
              value={searchTerm}
            />
          </div>
          <p className="text-sm font-medium text-slate-500">{filteredTables.length} {filteredTables.length === 1 ? 'table' : 'tables'}</p>
        </div>

        {filteredTables.length === 0 ? (
          <div className="p-8">
            <StatePanel
              description={tables.length === 0 ? 'Add your first table to create its QR ordering access.' : 'Try another table number.'}
              title={tables.length === 0 ? 'No tables yet.' : 'No matching tables.'}
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-3.5 font-bold">Table number</th>
                    <th className="px-5 py-3.5 font-bold">Capacity</th>
                    <th className="px-5 py-3.5 font-bold">Current status</th>
                    <th className="px-5 py-3.5 font-bold">Active</th>
                    <th className="px-5 py-3.5 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTables.map((table) => (
                    <tr className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80" key={table.id}>
                      <td className="px-5 py-4 font-semibold text-slate-900">Table {table.tableNumber}</td>
                      <td className="px-5 py-4 text-slate-600">{table.capacity} seats</td>
                      <td className="px-5 py-4"><TableStatusBadge status={table.status} /></td>
                      <td className="px-5 py-4"><ActiveBadge isActive={table.isActive} /></td>
                      <td className="px-5 py-4"><TableActions onDelete={() => setDeletingTable(table)} onEdit={() => openEditForm(table)} onQr={() => setQrTable(table)} /></td>
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
                        <h2 className="truncate text-base font-bold text-slate-900">Table {table.tableNumber}</h2>
                        <p className="mt-0.5 text-sm text-slate-500">{table.capacity} seats</p>
                      </div>
                    </div>
                    <Button aria-label={`Show QR code for Table ${table.tableNumber}`} className="shrink-0 px-3 py-2 text-xs" onClick={() => setQrTable(table)} variant="secondary">QR</Button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-100 py-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Status</p>
                      <div className="mt-1.5"><TableStatusBadge status={table.status} /></div>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Availability</p>
                      <div className="mt-1.5"><ActiveBadge isActive={table.isActive} /></div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button className="w-full px-3 py-2 text-xs" onClick={() => openEditForm(table)} variant="outline">Edit table</Button>
                    <Button className="w-full px-3 py-2 text-xs" onClick={() => setDeletingTable(table)} variant="danger">Delete</Button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {isFormOpen && <TableFormModal error={actionError} initialTable={editingTable} isSubmitting={isSubmitting} onCancel={() => { if (!isSubmitting) { setIsFormOpen(false); setEditingTable(null) } }} onSubmit={handleSave} />}
      {deletingTable && <ConfirmationDialog confirmLabel="Delete table" description={`Delete Table ${deletingTable.tableNumber}? This cannot be undone.`} isLoading={isSubmitting} onCancel={() => { if (!isSubmitting) setDeletingTable(null) }} onConfirm={handleDelete} title="Delete table" />}
      {qrTable && <TableQrModal onClose={() => setQrTable(null)} table={qrTable} />}
    </div>
  )
}

export default TableManagement
