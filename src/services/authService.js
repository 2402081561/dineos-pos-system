import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from './firebase'

export function signInAdmin(email, password) {
  return signInWithEmailAndPassword(auth, email, password)
}

export function subscribeToAuthState(onUserChange) {
  return onAuthStateChanged(auth, onUserChange)
}
