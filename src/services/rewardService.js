import { collection, doc, onSnapshot, orderBy, query, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { logAuditEvent } from './auditLogService'
import { memberIdIndexReference } from './memberService'

const rewardsCollection = collection(db, 'rewards')

function validPoints(value) { const points = Number(value); return Number.isInteger(points) && points > 0 ? points : null }
function rewardKey(menuItemId, pointsRequired) { return `${String(menuItemId).trim()}-${pointsRequired}` }
function rewardIndexReference(menuItemId, pointsRequired) { return doc(db, 'rewardIndex', rewardKey(menuItemId, pointsRequired)) }
function toReward(snapshot) { return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null }

function validateReward(input) {
  const name = String(input?.name ?? '').trim()
  const menuItemId = String(input?.menuItemId ?? '').trim()
  const pointsRequired = validPoints(input?.pointsRequired)
  if (!name || name.length > 100) throw new Error('Enter a reward name between 1 and 100 characters.')
  if (!menuItemId) throw new Error('Select a menu item.')
  if (!pointsRequired) throw new Error('Points required must be a positive whole number.')
  return { name, menuItemId, pointsRequired, isAvailable: input?.isAvailable === true }
}

export function subscribeToRewards(onUpdate, onError) { return onSnapshot(query(rewardsCollection, orderBy('createdAt', 'desc')), (snapshot) => onUpdate(snapshot.docs.map(toReward)), onError) }

export async function saveReward(input, rewardDocumentId = '') {
  const data = validateReward(input)
  const rewardReference = rewardDocumentId ? doc(db, 'rewards', rewardDocumentId) : doc(rewardsCollection)
  await runTransaction(db, async (transaction) => {
    const existingSnapshot = rewardDocumentId ? await transaction.get(rewardReference) : null
    if (rewardDocumentId && !existingSnapshot.exists()) throw new Error('This reward is no longer available.')
    const indexReference = rewardIndexReference(data.menuItemId, data.pointsRequired)
    const indexSnapshot = await transaction.get(indexReference)
    if (indexSnapshot.exists() && indexSnapshot.data().rewardDocumentId !== rewardReference.id) throw new Error('A reward already exists for this menu item and points value.')
    const counterReference = doc(db, 'counters', 'rewards')
    const counterSnapshot = await transaction.get(counterReference)
    const sequence = Math.max(0, Number(counterSnapshot.data()?.lastSequence) || 0) + 1
    const rewardId = existingSnapshot?.data()?.rewardId || `REW-${String(sequence).padStart(5, '0')}`
    transaction.set(rewardReference, { ...data, rewardId, ...(rewardDocumentId ? {} : { createdAt: serverTimestamp() }), updatedAt: serverTimestamp() }, { merge: true })
    transaction.set(indexReference, { rewardDocumentId: rewardReference.id, rewardId, updatedAt: serverTimestamp() })
    if (!rewardDocumentId) transaction.set(counterReference, { lastSequence: sequence, updatedAt: serverTimestamp() }, { merge: true })
  })
  void logAuditEvent({ action: rewardDocumentId ? 'UPDATE_REWARD' : 'CREATE_REWARD', category: 'ADMIN', targetType: 'reward', targetId: rewardReference.id, details: { name: data.name, pointsRequired: data.pointsRequired } })
}

function datePrefix() { const now = new Date(); return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` }

export async function redeemReward({ memberId, rewardDocumentId }) {
  const normalizedMemberId = String(memberId ?? '').trim().toUpperCase()
  const rewardReference = doc(db, 'rewards', String(rewardDocumentId ?? '').trim())
  if (!normalizedMemberId || !rewardDocumentId) throw new Error('Choose a valid member and reward.')
  const prefix = datePrefix()
  return runTransaction(db, async (transaction) => {
    const memberIndex = await transaction.get(memberIdIndexReference(normalizedMemberId))
    if (!memberIndex.exists()) throw new Error('This member is no longer available.')
    const memberReference = doc(db, 'members', String(memberIndex.data().memberDocumentId ?? ''))
    const [memberSnapshot, rewardSnapshot, counterSnapshot] = await Promise.all([transaction.get(memberReference), transaction.get(rewardReference), transaction.get(doc(db, 'counters', `redemption-${prefix}`))])
    const member = memberSnapshot.data(); const reward = rewardSnapshot.data()
    if (!memberSnapshot.exists() || member?.memberId !== normalizedMemberId || String(member.status ?? '').toLowerCase() !== 'active') throw new Error('This member is not eligible for rewards.')
    if (!rewardSnapshot.exists() || reward?.isAvailable !== true) throw new Error('This reward is no longer available.')
    const pointsRequired = validPoints(reward.pointsRequired)
    if (!pointsRequired) throw new Error('This reward has invalid points requirements.')
    const menuReference = doc(db, 'menuItems', String(reward.menuItemId ?? ''))
    const menuSnapshot = await transaction.get(menuReference)
    if (!menuSnapshot.exists() || menuSnapshot.data().isAvailable !== true) throw new Error('The menu item for this reward is no longer available.')
    const balance = Math.max(0, Math.floor(Number(member.pointsBalance) || 0))
    if (balance < pointsRequired) throw new Error('This member does not have enough points.')
    const sequence = Math.max(0, Number(counterSnapshot.data()?.lastNumber) || 0) + 1
    const redemptionReference = `RED-${prefix}-${String(sequence).padStart(4, '0')}`
    const transactionReference = doc(db, 'memberPointTransactions', `redemption-${redemptionReference}`)
    if ((await transaction.get(transactionReference)).exists()) throw new Error('This redemption was already processed.')
    transaction.update(memberReference, { pointsBalance: balance - pointsRequired, updatedAt: serverTimestamp() })
    transaction.set(doc(db, 'counters', `redemption-${prefix}`), { lastNumber: sequence, updatedAt: serverTimestamp() }, { merge: true })
    transaction.set(transactionReference, { transactionId: transactionReference.id, memberId: normalizedMemberId, type: 'REDEEM', points: -pointsRequired, rewardId: reward.rewardId ?? rewardReference.id, rewardDocumentId: rewardReference.id, menuItemId: reward.menuItemId, rewardName: reward.name, source: 'REWARD', redemptionReference, createdAt: serverTimestamp() })
    return { memberName: String(member.name ?? '').trim() || 'Member', pointsUsed: pointsRequired, pointsBalance: balance - pointsRequired, rewardName: reward.name, redemptionReference, rewardId: reward.rewardId ?? rewardReference.id }
  }).then((result) => { void logAuditEvent({ action: 'REDEEM_REWARD', category: 'LOYALTY', targetType: 'reward', targetId: result.rewardId, details: { memberId: normalizedMemberId, rewardId: result.rewardId, rewardName: result.rewardName, pointsUsed: result.pointsUsed, redemptionReference: result.redemptionReference } }); return result })
}
