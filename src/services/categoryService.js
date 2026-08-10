import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'

const categoriesCollection = collection(db, 'categories')

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
  return addDoc(categoriesCollection, {
    ...buildCategoryData(category),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateCategory(categoryId, category) {
  await updateDoc(doc(db, 'categories', categoryId), {
    ...buildCategoryData(category),
    updatedAt: serverTimestamp(),
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
  await deleteDoc(doc(db, 'categories', categoryId))
}
