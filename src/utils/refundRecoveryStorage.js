export function createRefundRecoveryStorage(getStorage = () => window.sessionStorage) {
  const key = (actorId) => `dineos-manual-refund-v1:${encodeURIComponent(actorId)}`
  const valid = (record, actorId) => record?.actorId === actorId && typeof record.receiptNumber === 'string' && record.receiptNumber.length <= 100 &&
    /^[0-9a-f-]{36}$/i.test(record.body?.requestId ?? '') && typeof record.body?.reason === 'string' && record.body.reason.length <= 500 &&
    Number(record.body?.amount) > 0 && Number.isFinite(Number(record.body.amount)) && record.body.fundsReturned === true &&
    ['Cash', 'Original payment method', 'Other'].includes(record.body.method)
  return {
    read(actorId) {
      if (!actorId) return null
      try { const raw = getStorage().getItem(key(actorId)); if (!raw) return null; const record = JSON.parse(raw); return valid(record, actorId) ? record : { actorId, damaged: true } }
      catch { return { actorId, damaged: true } }
    },
    save(record) { if (!valid(record, record.actorId)) throw new Error('Invalid refund request.'); getStorage().setItem(key(record.actorId), JSON.stringify(record)) },
    clear(actorId) { getStorage().removeItem(key(actorId)) },
  }
}
export const refundRecoveryStorage = createRefundRecoveryStorage()
