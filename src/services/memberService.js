import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { db } from './firebase'
import { isValidMemberEmail, isValidMemberPhone, normalizeMemberPhone } from '../utils/member'

const membersCollection = collection(db, 'members')
const memberCounterReference = doc(db, 'counters', 'members')

export class MemberAlreadyExistsError extends Error {
  constructor(member) {
    super('An account already exists for this phone number.')
    this.name = 'MemberAlreadyExistsError'
    this.member = member
  }
}

function cleanName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function phoneIndexReference(normalizedPhone) {
  return doc(db, 'memberPhoneIndex', encodeURIComponent(normalizedPhone))
}

export function memberIdIndexReference(memberId) {
  return doc(db, 'memberIdIndex', String(memberId ?? '').trim().toUpperCase())
}

function memberData(snapshot) {
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

function formattedMemberId(sequence) {
  return `MEM-${String(sequence).padStart(5, '0')}`
}

function validateMemberInput(input) {
  const name = cleanName(input?.name)
  const phone = String(input?.phone ?? '').trim()
  const normalizedPhone = normalizeMemberPhone(phone)
  const email = String(input?.email ?? '').trim().toLowerCase()
  if (!name || name.length > 80) throw new Error('Enter a name between 1 and 80 characters.')
  if (!isValidMemberPhone(phone)) throw new Error('Enter a valid Malaysian phone number, or an international number with a + country code.')
  if (!isValidMemberEmail(email)) throw new Error('Enter a valid email address or leave it blank.')
  return { email, emailNotificationsEnabled: input?.emailNotificationsEnabled === true, name, normalizedPhone, phone }
}

export async function createMember(input) {
  const member = validateMemberInput(input)
  const memberReference = doc(membersCollection)
  const indexReference = phoneIndexReference(member.normalizedPhone)

  return runTransaction(db, async (transaction) => {
    const indexSnapshot = await transaction.get(indexReference)
    if (indexSnapshot.exists()) {
      const existingSnapshot = await transaction.get(doc(db, 'members', String(indexSnapshot.data().memberDocumentId ?? '')))
      throw new MemberAlreadyExistsError(memberData(existingSnapshot) ?? { memberId: indexSnapshot.data().memberId, status: indexSnapshot.data().status ?? 'active' })
    }

    const counterSnapshot = await transaction.get(memberCounterReference)
    const currentSequence = Number(counterSnapshot.data()?.lastSequence)
    const sequence = Number.isSafeInteger(currentSequence) && currentSequence >= 0 ? currentSequence + 1 : 1
    const memberId = formattedMemberId(sequence)
    const data = { ...member, memberId, pointsBalance: 0, status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
    transaction.set(memberReference, data)
    transaction.set(memberCounterReference, { lastSequence: sequence, updatedAt: serverTimestamp() }, { merge: true })
    transaction.set(indexReference, { memberDocumentId: memberReference.id, memberId, normalizedPhone: member.normalizedPhone, status: 'active', updatedAt: serverTimestamp() })
    transaction.set(memberIdIndexReference(memberId), { memberDocumentId: memberReference.id, memberId, updatedAt: serverTimestamp() })
    return { id: memberReference.id, ...data }
  })
}

export async function getMemberById(memberId) {
  const normalizedMemberId = String(memberId ?? '').trim().toUpperCase()
  if (!normalizedMemberId) return null
  const indexSnapshot = await getDoc(memberIdIndexReference(normalizedMemberId))
  if (indexSnapshot.exists()) return memberData(await getDoc(doc(db, 'members', String(indexSnapshot.data().memberDocumentId ?? ''))))
  const snapshot = await getDocs(query(membersCollection, where('memberId', '==', normalizedMemberId), limit(1)))
  return memberData(snapshot.docs[0] ?? { exists: () => false })
}

export async function findMemberByPhone(phone) {
  const normalizedPhone = normalizeMemberPhone(phone)
  if (!isValidMemberPhone(phone)) return null
  const indexSnapshot = await getDoc(phoneIndexReference(normalizedPhone))
  if (!indexSnapshot.exists()) return null
  return memberData(await getDoc(doc(db, 'members', String(indexSnapshot.data().memberDocumentId ?? ''))))
}

export async function findMember(identifier) {
  const queryText = String(identifier ?? '').trim()
  if (!queryText) return null
  return queryText.toUpperCase().startsWith('MEM-') ? getMemberById(queryText) : findMemberByPhone(queryText)
}

export async function updateMember(memberDocumentId, changes) {
  const memberReference = doc(db, 'members', String(memberDocumentId ?? '').trim())
  const allowed = {}
  if (changes?.name !== undefined) {
    const name = cleanName(changes.name)
    if (!name || name.length > 80) throw new Error('Enter a name between 1 and 80 characters.')
    allowed.name = name
  }
  if (changes?.email !== undefined) {
    const email = String(changes.email ?? '').trim().toLowerCase()
    if (!isValidMemberEmail(email)) throw new Error('Enter a valid email address or leave it blank.')
    allowed.email = email
  }
  if (changes?.emailNotificationsEnabled !== undefined) allowed.emailNotificationsEnabled = changes.emailNotificationsEnabled === true
  if (changes?.status !== undefined) {
    const status = String(changes.status).toLowerCase()
    if (!['active', 'inactive'].includes(status)) throw new Error('Select a valid member status.')
    allowed.status = status
  }
  if (Object.keys(allowed).length === 0) throw new Error('No valid member changes were provided.')
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(memberReference)
    if (!snapshot.exists()) throw new Error('This member is no longer available.')
    transaction.update(memberReference, { ...allowed, updatedAt: serverTimestamp() })
  })
}

export function subscribeToMembers(onUpdate, onError) {
  return onSnapshot(query(membersCollection, orderBy('createdAt', 'desc')), (snapshot) => onUpdate(snapshot.docs.map(memberData)), onError)
}

export function subscribeToMember(memberDocumentId, onUpdate, onError) {
  return onSnapshot(doc(db, 'members', String(memberDocumentId ?? '').trim()), (snapshot) => onUpdate(memberData(snapshot)), onError)
}
