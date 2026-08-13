import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/common/Button'
import ConfirmationDialog from '../../components/common/ConfirmationDialog'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import CategoryFormModal from '../../components/admin/CategoryFormModal'
import useToast from '../../hooks/useToast'
import { createSupabaseCategory as createCategory, deleteSupabaseCategory as deleteCategory, subscribeToSupabaseCategories as subscribeToCategories, updateSupabaseCategory as updateCategory, updateSupabaseCategoryActive as updateCategoryActiveStatus } from '../../services/adminApiService'

function CategoryManagement() {
  const { showToast } = useToast()
  const [categories, setCategories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [editingCategory, setEditingCategory] = useState(null)
  const [deletingCategory, setDeletingCategory] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updatingCategoryId, setUpdatingCategoryId] = useState('')

  useEffect(() => subscribeToCategories(
    (categoryData) => {
      setCategories(categoryData)
      setIsLoading(false)
    },
    (firebaseError) => {
      console.error('[Category Management] Failed to load categories:', firebaseError)
      setError('We could not load categories right now. Please try again shortly.')
      setIsLoading(false)
    },
  ), [])

  const filteredCategories = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return categories.filter((category) => category.name?.toLowerCase().includes(normalizedSearch))
  }, [categories, searchTerm])

  function openCreateForm() {
    setActionError('')
    setEditingCategory(null)
    setIsFormOpen(true)
  }

  function openEditForm(category) {
    setActionError('')
    setEditingCategory(category)
    setIsFormOpen(true)
  }

  async function handleSave(category) {
    const normalizedName = category.name.trim().toLowerCase()
    const isDuplicate = categories.some((existingCategory) => existingCategory.id !== editingCategory?.id && existingCategory.name?.trim().toLowerCase() === normalizedName)

    if (isDuplicate) {
      setActionError('A category with this name already exists.')
      return
    }

    if (!Number.isFinite(Number(category.sortOrder))) {
      setActionError('Sort order must be numeric.')
      return
    }

    try {
      setIsSubmitting(true)
      setActionError('')
      if (editingCategory) {
        await updateCategory(editingCategory.id, category)
        showToast('Category updated.')
      } else {
        await createCategory(category)
        showToast('Category created.')
      }
      setEditingCategory(null)
      setIsFormOpen(false)
    } catch (firebaseError) {
      console.error('[Category Management] Failed to save category:', firebaseError)
      setActionError('We could not save this category. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete() {
    try {
      setIsSubmitting(true)
      setActionError('')
      await deleteCategory(deletingCategory.id)
      showToast('Category deleted.')
      setDeletingCategory(null)
    } catch (firebaseError) {
      console.error('[Category Management] Failed to delete category:', firebaseError)
      setActionError('We could not delete this category. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleActive(category) {
    try {
      setUpdatingCategoryId(category.id)
      setActionError('')
      await updateCategoryActiveStatus(category, category.isActive === false)
    } catch (firebaseError) {
      console.error('[Category Management] Failed to update category status:', firebaseError)
      setActionError('We could not update this category. Please try again.')
    } finally {
      setUpdatingCategoryId('')
    }
  }

  if (isLoading) return <div className="space-y-6 animate-pulse"><div className="h-20 rounded-2xl bg-slate-200" /><div className="surface-card h-96 bg-white" /></div>
  if (error) return <StatePanel description={error} title="Category management unavailable" tone="error" />

  return <div className="space-y-6"><SectionHeading action={<Button onClick={openCreateForm}>+ Add category</Button>} description="Group dishes into clear, easy-to-browse menu sections." eyebrow="Administration" title="Manage categories" />{actionError && <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">{actionError}</p>}<section className="surface-card overflow-hidden"><div className="border-b border-slate-100 p-4"><div className="relative w-full sm:max-w-xs"><span className="absolute left-3 top-2.5 text-slate-400">⌕</span><input className="w-full rounded-xl bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-orange-400" onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search categories" value={searchTerm} /></div></div>{filteredCategories.length === 0 ? <div className="p-8"><StatePanel description={categories.length === 0 ? 'Add your first category to organise your menu.' : 'Try another category name.'} title={categories.length === 0 ? 'No categories yet.' : 'No matching categories.'} /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3 font-bold">Category</th><th className="px-5 py-3 font-bold">Sort order</th><th className="px-5 py-3 font-bold">Status</th><th className="px-5 py-3 text-right font-bold">Actions</th></tr></thead><tbody>{filteredCategories.map((category) => <tr className="border-b last:border-0" key={category.id}><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-xl">{category.icon || '🍽️'}</span><p className="font-semibold text-slate-900">{category.name}</p></div></td><td className="px-5 py-4 font-semibold text-slate-600">{category.sortOrder}</td><td className="px-5 py-4"><button className={`rounded-full px-2.5 py-1 text-xs font-bold disabled:opacity-50 ${category.isActive !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`} disabled={updatingCategoryId === category.id} onClick={() => handleToggleActive(category)} type="button">{category.isActive !== false ? 'Active' : 'Inactive'}</button></td><td className="px-5 py-4 text-right"><Button className="mr-2 px-3 py-1.5 text-xs" disabled={updatingCategoryId === category.id} onClick={() => openEditForm(category)} variant="outline">Edit</Button><Button className="px-3 py-1.5 text-xs" disabled={updatingCategoryId === category.id} onClick={() => setDeletingCategory(category)} variant="danger">Delete</Button></td></tr>)}</tbody></table></div>}</section>{isFormOpen && <CategoryFormModal error={actionError} initialCategory={editingCategory} isSubmitting={isSubmitting} onCancel={() => { if (!isSubmitting) { setIsFormOpen(false); setEditingCategory(null) } }} onSubmit={handleSave} />}{deletingCategory && <ConfirmationDialog confirmLabel="Delete category" description={`Delete “${deletingCategory.name}”? This cannot be undone.`} isLoading={isSubmitting} onCancel={() => { if (!isSubmitting) setDeletingCategory(null) }} onConfirm={handleDelete} title="Delete category" />}</div>
}

export default CategoryManagement
