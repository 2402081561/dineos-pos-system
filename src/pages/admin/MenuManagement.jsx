import { useMemo, useState } from 'react'
import Button from '../../components/common/Button'
import ConfirmationDialog from '../../components/common/ConfirmationDialog'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import MenuItemFormModal from '../../components/admin/MenuItemFormModal'
import useAdminMenu from '../../hooks/useAdminMenu'
import useToast from '../../hooks/useToast'
import { createMenuItem, deleteMenuItem, updateMenuItem, updateMenuItemFlags } from '../../services/menuService'
import { uploadMenuImage } from '../../services/cloudinaryService'
import { formatCurrency } from '../../utils/currency'

function MenuManagement() {
  const { menuItems, categories, isLoading, error } = useAdminMenu()
  const { showToast } = useToast()
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [editingItem, setEditingItem] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [deletingItem, setDeletingItem] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [updatingItemId, setUpdatingItemId] = useState('')
  const [actionError, setActionError] = useState('')

  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])
  const filteredItems = useMemo(() => menuItems.filter((item) => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.trim().toLowerCase())
    const matchesCategory = categoryFilter === 'all' || item.categoryId === categoryFilter
    return matchesSearch && matchesCategory
  }), [menuItems, searchTerm, categoryFilter])

  function openCreateForm() {
    setEditingItem(null)
    setIsFormOpen(true)
  }

  async function handleSave(menuItem) {
    try {
      setIsSubmitting(true)
      setUploadProgress(0)
      setActionError('')
      const imageUrl = menuItem.imageFile
        ? await uploadMenuImage(menuItem.imageFile, setUploadProgress)
        : editingItem?.imageUrl
      const menuItemData = { ...menuItem, imageUrl }

      if (!menuItemData.imageUrl) {
        throw new Error('Please select an image file.')
      }

      if (editingItem) {
        await updateMenuItem(editingItem.id, menuItemData)
        showToast('Food item updated.')
      } else {
        await createMenuItem(menuItemData)
        showToast('Food item created.')
      }
      setIsFormOpen(false)
      setEditingItem(null)
    } catch (firebaseError) {
      console.error('[Menu Management] Failed to save food:', firebaseError)
      setActionError('We could not save this food item. Please try again.')
    } finally {
      setIsSubmitting(false)
      setUploadProgress(0)
    }
  }

  async function handleDelete() {
    try {
      setIsSubmitting(true)
      setActionError('')
      await deleteMenuItem(deletingItem.id)
      showToast('Food item deleted.')
      setDeletingItem(null)
    } catch (firebaseError) {
      console.error('[Menu Management] Failed to delete food:', firebaseError)
      setActionError('We could not delete this food item. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggle(item, field) {
    try {
      setUpdatingItemId(item.id)
      setActionError('')
      await updateMenuItemFlags(item.id, { [field]: !item[field] })
    } catch (firebaseError) {
      console.error('[Menu Management] Failed to update food flag:', firebaseError)
      setActionError('We could not update this food item. Please try again.')
    } finally {
      setUpdatingItemId('')
    }
  }

  if (isLoading) return <div className="space-y-6 animate-pulse"><div className="h-20 rounded-2xl bg-slate-200" /><div className="surface-card h-96 bg-white" /></div>
  if (error) return <StatePanel description={error} title="Menu management unavailable" tone="error" />

  return <div className="space-y-6"><SectionHeading eyebrow="Administration" title="Manage menu" description="Create and organise the dishes your guests can order." action={<Button onClick={openCreateForm}>+ Add dish</Button>} />{actionError && <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">{actionError}</p>}<section className="surface-card overflow-hidden"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-xs"><span className="absolute left-3 top-2.5 text-slate-400">⌕</span><input className="w-full rounded-xl bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-orange-400" onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search food name" value={searchTerm} /></div><select className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 outline-none focus:border-orange-400" onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}><option value="all">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>{filteredItems.length === 0 ? <div className="p-8"><StatePanel description={menuItems.length === 0 ? 'Add your first dish to start building the menu.' : 'Try another food name or category.'} title={menuItems.length === 0 ? 'No menu items yet.' : 'No matching food items.'} /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3 font-bold">Food</th><th className="px-5 py-3 font-bold">Category</th><th className="px-5 py-3 font-bold">Price</th><th className="px-5 py-3 font-bold">Available</th><th className="px-5 py-3 font-bold">Popular</th><th className="px-5 py-3 text-right font-bold">Actions</th></tr></thead><tbody>{filteredItems.map((item) => <tr className="border-b last:border-0" key={item.id}><td className="px-5 py-4"><div className="flex items-center gap-3"><img alt="" className="h-12 w-12 rounded-xl object-cover" src={item.imageUrl} /><div><p className="font-semibold text-slate-900">{item.name}</p><p className="mt-1 max-w-56 truncate text-xs text-slate-400">{item.description}</p></div></div></td><td className="px-5 py-4 text-slate-600">{categoryNames.get(item.categoryId) ?? 'Uncategorised'}</td><td className="px-5 py-4 font-semibold text-orange-600">{formatCurrency(item.price)}</td><td className="px-5 py-4"><button className={`rounded-full px-2.5 py-1 text-xs font-bold disabled:opacity-50 ${item.isAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`} disabled={updatingItemId === item.id} onClick={() => handleToggle(item, 'isAvailable')} type="button">{item.isAvailable ? 'Available' : 'Unavailable'}</button></td><td className="px-5 py-4"><button className={`rounded-full px-2.5 py-1 text-xs font-bold disabled:opacity-50 ${item.isPopular ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-500'}`} disabled={updatingItemId === item.id} onClick={() => handleToggle(item, 'isPopular')} type="button">{item.isPopular ? 'Popular' : 'Standard'}</button></td><td className="px-5 py-4 text-right"><Button className="mr-2 px-3 py-1.5 text-xs" disabled={updatingItemId === item.id} onClick={() => { setEditingItem(item); setIsFormOpen(true) }} variant="outline">Edit</Button><Button className="px-3 py-1.5 text-xs" disabled={updatingItemId === item.id} onClick={() => setDeletingItem(item)} variant="danger">Delete</Button></td></tr>)}</tbody></table></div>}</section>{isFormOpen && <MenuItemFormModal categories={categories} error={actionError} initialItem={editingItem} isSubmitting={isSubmitting} onCancel={() => { if (!isSubmitting) { setIsFormOpen(false); setEditingItem(null) } }} onSubmit={handleSave} uploadProgress={uploadProgress} />}{deletingItem && <ConfirmationDialog confirmLabel="Delete food" description={`Delete “${deletingItem.name}”? This cannot be undone.`} isLoading={isSubmitting} onCancel={() => { if (!isSubmitting) setDeletingItem(null) }} onConfirm={handleDelete} title="Delete food item" />}</div>
}

export default MenuManagement
