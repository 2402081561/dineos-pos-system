import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

function environmentValue(name) {
  const value = import.meta.env[name]
  return typeof value === 'string' ? value.trim() : value
}

const firebaseConfig = {
  apiKey: environmentValue('VITE_FIREBASE_API_KEY'),
  authDomain: environmentValue('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: environmentValue('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: environmentValue('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: environmentValue('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: environmentValue('VITE_FIREBASE_APP_ID'),
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
