import { readFile } from 'node:fs/promises'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
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

const auth = getAuth(app)
const db = getFirestore(app)

if (auth.app !== app || db.app !== app) {
  throw new Error('Firebase services were not attached to the initialized app.')
}

console.log('Firebase App, Authentication, and Firestore initialized successfully.')
