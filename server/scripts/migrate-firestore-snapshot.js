import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { collection, getDocs, getFirestore, Timestamp } from 'firebase/firestore'
import pg from 'pg'

const directory = path.dirname(fileURLToPath(import.meta.url))
const serverDirectory = path.resolve(directory, '..')
const projectDirectory = path.resolve(serverDirectory, '..')
dotenv.config({ path: path.join(serverDirectory, '.env') })

const sourceCollections = [
  'auditLogs',
  'categories',
  'categoryNameLocks',
  'memberPointTransactions',
  'members',
  'menuItems',
  'orders',
  'rewards',
  'serviceRequestLocks',
  'serviceRequests',
  'shiftClosings',
  'tableNumberLocks',
  'tableSessions',
  'tables',
]

function serializeFirestore(value) {
  if (value instanceof Timestamp) return { __firestoreType: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds }
  if (Array.isArray(value)) return value.map(serializeFirestore)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeFirestore(item)]))
  return value
}

async function firebaseConfiguration() {
  const content = await readFile(path.join(projectDirectory, '.env'), 'utf8')
  const values = Object.fromEntries(content.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#')).map((line) => {
    const separator = line.indexOf('=')
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
  }))
  const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID']
  const missing = required.filter((key) => !values[key])
  if (missing.length) throw new Error(`Missing Firebase configuration: ${missing.join(', ')}`)
  return {
    apiKey: values.VITE_FIREBASE_API_KEY,
    authDomain: values.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: values.VITE_FIREBASE_PROJECT_ID,
    storageBucket: values.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: values.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: values.VITE_FIREBASE_APP_ID,
  }
}

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in server/.env before importing data.')

const app = getApps().length ? getApp() : initializeApp(await firebaseConfiguration())
const firestore = getFirestore(app)
const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

try {
  for (const collectionName of sourceCollections) {
    const snapshot = await getDocs(collection(firestore, collectionName))
    for (const document of snapshot.docs) {
      await pool.query(
        `INSERT INTO firebase_import_documents (source_collection, source_document_id, source_data, imported_at)
         VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT (source_collection, source_document_id)
         DO UPDATE SET source_data = EXCLUDED.source_data, imported_at = EXCLUDED.imported_at`,
        [collectionName, document.id, JSON.stringify(serializeFirestore(document.data()))],
      )
    }
    console.info(`[Migration] Imported ${snapshot.size} document(s) from ${collectionName}.`)
  }
  console.info('[Migration] Firestore snapshot completed without modifying Firebase.')
} finally {
  await pool.end()
}
