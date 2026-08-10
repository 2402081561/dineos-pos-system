import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'

const menuItemsCollection = collection(db, 'menuItems')

function toStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean)
}

function buildMenuItemData(menuItem) {
  return {
    name: menuItem.name.trim(),
    description: menuItem.description.trim(),
    categoryId: menuItem.categoryId,
    price: Number(menuItem.price),
    imageUrl: menuItem.imageUrl.trim(),
    ingredients: toStringArray(menuItem.ingredients),
    allergyInformation: toStringArray(menuItem.allergyInformation),
    isAvailable: Boolean(menuItem.isAvailable),
    isPopular: Boolean(menuItem.isPopular),
  }
}

export async function getAvailableMenuItems() {
  console.log('[Firestore] Querying all menu items without filters:', { collection: 'menuItems' })

  try {
    const snapshot = await getDocs(menuItemsCollection)
    const menuItems = snapshot.docs.map((menuItem) => ({
      id: menuItem.id,
      ...menuItem.data(),
    }))

    console.log('[Firestore] menuItems snapshot size:', snapshot.size)
    console.log('[Firestore] menuItems query result:', menuItems)

    return menuItems
  } catch (error) {
    console.error('[Firestore] menuItems query failed:', error)
    throw error
  }
}

export function subscribeToAllMenuItems(onMenuItemsUpdate, onError) {
  const menuItemsQuery = query(menuItemsCollection, orderBy('name', 'asc'))

  return onSnapshot(
    menuItemsQuery,
    (snapshot) => {
      onMenuItemsUpdate(snapshot.docs.map((menuItem) => ({ id: menuItem.id, ...menuItem.data() })))
    },
    onError,
  )
}

export async function createMenuItem(menuItem) {
  return addDoc(menuItemsCollection, {
    ...buildMenuItemData(menuItem),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateMenuItem(menuItemId, menuItem) {
  await updateDoc(doc(db, 'menuItems', menuItemId), {
    ...buildMenuItemData(menuItem),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteMenuItem(menuItemId) {
  await deleteDoc(doc(db, 'menuItems', menuItemId))
}

export async function updateMenuItemFlags(menuItemId, updates) {
  await updateDoc(doc(db, 'menuItems', menuItemId), {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function getMenuItemById(menuItemId) {
  console.log('[Firestore] Querying menu item:', { collection: 'menuItems', id: menuItemId })

  try {
    const snapshot = await getDoc(doc(db, 'menuItems', menuItemId))
    const menuItem = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null

    console.log('[Firestore] menu item query result:', menuItem)
    console.log('[Firestore] menu item snapshot exists:', snapshot.exists())

    return menuItem
  } catch (error) {
    console.error('[Firestore] menu item query failed:', error)
    throw error
  }
}
