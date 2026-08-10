import { readFile } from 'node:fs/promises'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { collection, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
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

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return []
}

function getNormalizedFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key.trim().toLowerCase(), value]))
}

function getBoolean(value) {
  return value === true || String(value).trim().toLowerCase() === 'true'
}

const snapshot = await getDocs(collection(db, 'menuItems'))

if (snapshot.metadata.fromCache) {
  throw new Error('Firestore is offline. No menu documents were changed. Connect to the internet and run the script again.')
}

let updatedCount = 0

for (const menuItem of snapshot.docs) {
  const source = getNormalizedFields(menuItem.data())
  const price = Number(source.price)

  const fixedDocument = {
    name: String(source.name ?? menuItem.id).trim(),
    description: String(source.description ?? '').trim(),
    categoryId: String(source.categoryid ?? '').trim(),
    price: Number.isFinite(price) ? price : 0,
    imageUrl: String(source.imageurl ?? '').trim(),
    isAvailable: getBoolean(source.isavailable),
    isPopular: getBoolean(source.ispopular),
    ingredients: normalizeStringArray(source.ingredients),
    allergyInformation: normalizeStringArray(source.allergyinformation),
    createdAt: source.createdat ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(menuItem.ref, fixedDocument)
  updatedCount += 1
  console.log(`Fixed menu item: ${menuItem.id}`)
}

console.log(`Menu data fix complete: ${updatedCount} document(s) updated.`)
