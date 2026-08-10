import { readFile } from 'node:fs/promises'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirestore } from 'firebase/firestore'

const requiredKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

const envContent = await readFile('.env', 'utf8')
const envValues = Object.fromEntries(
  envContent
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => {
      const separatorIndex = line.indexOf('=')
      return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()]
    }),
)

const missingKeys = requiredKeys.filter((key) => !envValues[key])
if (missingKeys.length > 0) {
  throw new Error(`Missing Firebase environment variables: ${missingKeys.join(', ')}`)
}

const app = getApps().length > 0
  ? getApp()
  : initializeApp({
      apiKey: envValues.VITE_FIREBASE_API_KEY,
      authDomain: envValues.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: envValues.VITE_FIREBASE_PROJECT_ID,
      storageBucket: envValues.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: envValues.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: envValues.VITE_FIREBASE_APP_ID,
    })

const db = getFirestore(app)

const categories = [
  { id: 'main-course', name: 'Main Course', icon: '🍽️', sortOrder: 1, isActive: true },
  { id: 'drinks', name: 'Drinks', icon: '🥤', sortOrder: 2, isActive: true },
  { id: 'dessert', name: 'Dessert', icon: '🍰', sortOrder: 3, isActive: true },
]

const menuItems = [
  { id: 'classic-beef-burger', name: 'Classic Beef Burger', description: 'Juicy grilled beef patty with lettuce, tomato and house sauce.', price: 18.9, categoryId: 'main-course', imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80', ingredients: ['Beef patty', 'Brioche bun', 'Lettuce', 'Tomato', 'Cheddar'], allergyInformation: ['Gluten', 'Milk'], isPopular: true },
  { id: 'margherita-pizza', name: 'Margherita Pizza', description: 'Stone-baked pizza with tomato, mozzarella and fresh basil.', price: 22.9, categoryId: 'main-course', imageUrl: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=900&q=80', ingredients: ['Pizza dough', 'Tomato sauce', 'Mozzarella', 'Basil'], allergyInformation: ['Gluten', 'Milk'], isPopular: true },
  { id: 'grilled-chicken-chop', name: 'Grilled Chicken Chop', description: 'Tender grilled chicken served with vegetables and black pepper sauce.', price: 21.9, categoryId: 'main-course', imageUrl: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=900&q=80', ingredients: ['Chicken thigh', 'Mixed vegetables', 'Black pepper sauce'], allergyInformation: ['Soy'], isPopular: true },
  { id: 'creamy-spaghetti', name: 'Creamy Spaghetti', description: 'Spaghetti tossed in a rich cream sauce with mushrooms and parmesan.', price: 19.9, categoryId: 'main-course', imageUrl: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=80', ingredients: ['Spaghetti', 'Cream', 'Mushrooms', 'Parmesan'], allergyInformation: ['Gluten', 'Milk'], isPopular: false },
  { id: 'seafood-fried-rice', name: 'Seafood Fried Rice', description: 'Wok-fried rice with prawns, egg, vegetables and aromatic seasoning.', price: 17.9, categoryId: 'main-course', imageUrl: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=80', ingredients: ['Rice', 'Prawns', 'Egg', 'Vegetables'], allergyInformation: ['Shellfish', 'Egg', 'Soy'], isPopular: false },
  { id: 'crispy-french-fries', name: 'Crispy French Fries', description: 'Golden shoestring fries with a light herb seasoning.', price: 8.9, categoryId: 'main-course', imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=80', ingredients: ['Potatoes', 'Herb seasoning'], allergyInformation: [], isPopular: false },
  { id: 'chicken-nuggets', name: 'Chicken Nuggets', description: 'Six crispy chicken nuggets served with a dipping sauce.', price: 10.9, categoryId: 'main-course', imageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=900&q=80', ingredients: ['Chicken', 'Breadcrumbs', 'Seasoning'], allergyInformation: ['Gluten'], isPopular: true },
  { id: 'coke', name: 'Coke', description: 'Chilled classic cola served over ice.', price: 4.5, categoryId: 'drinks', imageUrl: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?auto=format&fit=crop&w=900&q=80', ingredients: ['Carbonated water', 'Sugar', 'Natural flavours'], allergyInformation: [], isPopular: true },
  { id: 'iced-lemon-tea', name: 'Iced Lemon Tea', description: 'Refreshing black tea with lemon and a touch of sweetness.', price: 5.9, categoryId: 'drinks', imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=80', ingredients: ['Black tea', 'Lemon', 'Sugar'], allergyInformation: [], isPopular: false },
  { id: 'cafe-latte', name: 'Café Latte', description: 'Smooth espresso with steamed milk and a delicate foam.', price: 8.5, categoryId: 'drinks', imageUrl: 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?auto=format&fit=crop&w=900&q=80', ingredients: ['Espresso', 'Milk'], allergyInformation: ['Milk'], isPopular: false },
  { id: 'vanilla-ice-cream', name: 'Vanilla Ice Cream', description: 'A creamy scoop of classic Madagascan vanilla ice cream.', price: 7.9, categoryId: 'dessert', imageUrl: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=900&q=80', ingredients: ['Milk', 'Cream', 'Vanilla', 'Sugar'], allergyInformation: ['Milk'], isPopular: false },
  { id: 'new-york-cheesecake', name: 'New York Cheesecake', description: 'Baked cheesecake with a buttery biscuit base and berry sauce.', price: 12.9, categoryId: 'dessert', imageUrl: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=900&q=80', ingredients: ['Cream cheese', 'Biscuit base', 'Egg', 'Berry sauce'], allergyInformation: ['Gluten', 'Milk', 'Egg'], isPopular: true },
]

async function createIfMissing(collectionName, record) {
  const reference = doc(db, collectionName, record.id)
  const snapshot = await getDoc(reference)

  if (snapshot.exists()) return false

  const { id, ...data } = record
  await setDoc(reference, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return true
}

const categoryResults = await Promise.all(categories.map((category) => createIfMissing('categories', category)))
const menuItemResults = await Promise.all(menuItems.map((menuItem) => createIfMissing('menuItems', {
  ...menuItem,
  isAvailable: true,
})))

const createdCategories = categoryResults.filter(Boolean).length
const createdMenuItems = menuItemResults.filter(Boolean).length

console.log(`Firestore seed complete: ${createdCategories} categories and ${createdMenuItems} menu items created.`)
