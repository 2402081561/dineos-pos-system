import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'

const categoriesCollection = collection(db, 'categories')
const categoryNameLocksCollection = collection(db, 'categoryNameLocks')

function normalizedCategoryName(value) {
  const name = String(value ?? '').trim()
  if (!name) throw new Error('Category name is required.')
  return name.toLocaleLowerCase()
}

function buildCategoryData(category) {
  return {
    name: category.name.trim(),
    icon: category.icon.trim(),
    sortOrder: Number(category.sortOrder),
    isActive: Boolean(category.isActive),
  }
}

export async function getActiveCategories() {
  const snapshot = await getDocs(query(categoriesCollection, orderBy('sortOrder', 'asc')))
  return snapshot.docs
    .map((category) => ({ id: category.id, ...category.data() }))
    .filter((category) => category.isActive !== false)
}

export function subscribeToCategories(onCategoriesUpdate, onError) {
  return onSnapshot(
    query(categoriesCollection, orderBy('sortOrder', 'asc')),
    (snapshot) => onCategoriesUpdate(snapshot.docs.map((category) => ({ id: category.id, ...category.data() }))),
    onError,
  )
}

export function subscribeToActiveCategories(onCategoriesUpdate, onError) {
  return subscribeToCategories(
    (categories) => onCategoriesUpdate(categories.filter((category) => category.isActive !== false)),
    onError,
  )
}

export function subscribeToCategoryById(categoryId, onCategoryUpdate, onError) {
  return onSnapshot(
    doc(db, 'categories', categoryId),
    (snapshot) => onCategoryUpdate(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    onError,
  )
}

export async function getCategoryById(categoryId) {
  if (!categoryId) return null

  const snapshot = await getDoc(doc(db, 'categories', categoryId))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export async function createCategory(category) {
  const categoryData = buildCategoryData(category)
  const normalizedName = normalizedCategoryName(categoryData.name)
  const categoryReference = doc(categoriesCollection)
  const lockReference = doc(categoryNameLocksCollection, normalizedName)
  const categoriesSnapshot = await getDocs(categoriesCollection)
  if (categoriesSnapshot.docs.some((snapshot) => normalizedCategoryName(snapshot.data().name) === normalizedName)) throw new Error('A category with this name already exists.')
  return runTransaction(db, async (transaction) => {
    const lockSnapshot = await transaction.get(lockReference)
    if (lockSnapshot.exists()) {
      throw new Error('A category with this name already exists.')
    }
    transaction.set(lockReference, { categoryId: categoryReference.id, normalizedName, updatedAt: serverTimestamp() })
    transaction.set(categoryReference, { ...categoryData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    return categoryReference
  })
}

export async function updateCategory(categoryId, category) {
  const categoryData = buildCategoryData(category)
  const normalizedName = normalizedCategoryName(categoryData.name)
  const categoryReference = doc(db, 'categories', categoryId)
  const lockReference = doc(categoryNameLocksCollection, normalizedName)
  const categoriesSnapshot = await getDocs(categoriesCollection)
  if (categoriesSnapshot.docs.some((snapshot) => snapshot.id !== categoryId && normalizedCategoryName(snapshot.data().name) === normalizedName)) throw new Error('A category with this name already exists.')
  await runTransaction(db, async (transaction) => {
    const [categorySnapshot, lockSnapshot] = await Promise.all([transaction.get(categoryReference), transaction.get(lockReference)])
    if (!categorySnapshot.exists()) throw new Error('This category is no longer available.')
    if (lockSnapshot.exists() && lockSnapshot.data().categoryId !== categoryId) {
      throw new Error('A category with this name already exists.')
    }
    const previousNormalizedName = normalizedCategoryName(categorySnapshot.data().name)
    if (previousNormalizedName !== normalizedName) {
      const previousLockReference = doc(categoryNameLocksCollection, previousNormalizedName)
      const previousLockSnapshot = await transaction.get(previousLockReference)
      if (previousLockSnapshot.data()?.categoryId === categoryId) transaction.delete(previousLockReference)
      transaction.set(lockReference, { categoryId, normalizedName, updatedAt: serverTimestamp() })
    }
    transaction.update(categoryReference, { ...categoryData, updatedAt: serverTimestamp() })
  })
}

export async function updateCategoryActiveStatus(categoryId, isActive) {
  await updateDoc(doc(db, 'categories', categoryId), {
    isActive,
    updatedAt: serverTimestamp(),
  })
}

export async function isCategoryUsed(categoryId) {
  const snapshot = await getDocs(query(collection(db, 'menuItems'), where('categoryId', '==', categoryId)))
  return !snapshot.empty
}

export async function deleteCategory(categoryId) {
  const categoryReference = doc(db, 'categories', categoryId)
  const menuItems = await getDocs(collection(db, 'menuItems'))
  if (menuItems.docs.some((snapshot) => snapshot.data().categoryId === categoryId)) throw new Error('This category is currently used by menu items.')
  await runTransaction(db, async (transaction) => {
    const categorySnapshot = await transaction.get(categoryReference)
    if (!categorySnapshot.exists()) throw new Error('This category is no longer available.')
    const lockReference = doc(categoryNameLocksCollection, normalizedCategoryName(categorySnapshot.data().name))
    const lockSnapshot = await transaction.get(lockReference)
    if (lockSnapshot.data()?.categoryId === categoryId) transaction.delete(lockReference)
    transaction.delete(categoryReference)
  })
}
