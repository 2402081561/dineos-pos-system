import { getReceiptDetails } from './receipt.js'
import { moneyToCents } from './cashPayment.js'
import { optionText } from '../../server/src/posRules.js'

export const ANDROID_PRINT_PACKAGE = 'com.dineos.printtest'
export const MAX_PRINT_BYTES = 32000

export function isAndroidPrintDevice(userAgent = '') {
  return /Android/i.test(userAgent)
}

// A display-only transport, not proof of payment. The receipt page obtains this
// snapshot from the role-protected paid-receipt API; the native app confirms it
// with the cashier and never changes payment/order state or accepts raw ESC/POS.
export function buildAndroidReceipt(receipt, { shopName = 'DineOS', t = (value) => value, language = 'en' } = {}) {
  const date = new Date(receipt?.paidAt)
  const total = moneyToCents(receipt?.grandTotal)
  if (!receipt?.receiptNumber || !receipt?.paidAt || !Number.isFinite(date.getTime()) || total === null || !receipt.orders?.length) throw new Error('Only completed payments can be printed as receipts.')
  const details = getReceiptDetails(receipt)
  const rows = []
  function row(left, right = '', style = 'normal') {
    const clean = (value) => [...String(value ?? '')].map((character) => {
      const code = character.codePointAt(0)
      return code < 32 || (code >= 127 && code <= 159) ? ' ' : character
    }).join('').trim()
    const entry = { left: clean(left), right: clean(right), style }
    if (entry.left.length > 1000 || entry.right.length > 120) throw new Error('This receipt is too large for Android handoff. Use browser printing instead.')
    rows.push(entry)
  }
  function multiline(value, style = 'normal') { for (const line of String(value ?? '').split(/\r?\n/)) if (line.trim()) row(line, '', style) }
  function money(value) {
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount < 0) throw new Error('The bill total is invalid.')
    return `RM ${amount.toFixed(2)}`
  }
  const rule = () => row('', '', 'rule')
  row(receipt.restaurantName || shopName, '', 'heading')
  multiline(receipt.shopSnapshot?.address, 'center')
  if (receipt.shopSnapshot?.phone) row(receipt.shopSnapshot.phone, '', 'center')
  row(t('Payment receipt'), '', 'center')
  row(`${t('TABLE')} ${receipt.tableNumber ?? '—'}`, '', 'heading')
  rule()
  row(t('Receipt'), receipt.receiptNumber)
  row(t('Date'), date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-MY', { timeZone: 'Asia/Kuching', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }))
  row(t('Type'), t(details.orderType))
  row(t('Cashier'), details.cashier)
  rule()
  if (!details.items.length) throw new Error('Only completed payments can be printed as receipts.')
  for (const item of details.items) {
    const quantity = Number(item.quantity), price = Number(item.price)
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0) throw new Error('The bill total is invalid.')
    row(`${quantity}× ${item.name}`, money(price * quantity), 'bold')
    if (item.orderType === 'take_away') row(t('TAKE AWAY'), '', 'bold')
    multiline(optionText(item.optionSnapshot))
    multiline(item.notes)
  }
  rule()
  row(t('Subtotal'), money(details.subtotal))
  if (details.discount > 0) row(t('Discount'), `−${money(details.discount)}`)
  if (details.serviceCharge > 0) row(t('Service charge'), money(details.serviceCharge))
  if (details.sst > 0) row(t('SST'), money(details.sst))
  row(t('TOTAL'), money(total / 100), 'bold')
  row(t('Paid by'), t(receipt.paymentMethod))
  if (details.cashTender) {
    row(t('Cash received'), money(details.cashTender.received))
    row(t('Change'), money(details.cashTender.change), 'bold')
  }
  rule()
  multiline(t(receipt.shopSnapshot?.receiptFooter ?? 'Thank you! Please come again.'), 'center')
  const payload = { version: 1, kind: 'paid_receipt', receiptNumber: String(receipt.receiptNumber), rows }
  if (rows.length > 300 || new TextEncoder().encode(JSON.stringify(payload)).length > MAX_PRINT_BYTES) throw new Error('This receipt is too large for Android handoff. Use browser printing instead.')
  return payload
}

export function androidReceiptIntent(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  if (bytes.length > MAX_PRINT_BYTES) throw new Error('This receipt is too large for Android handoff. Use browser printing instead.')
  const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  // Package-bound Chrome intent. No receipt data in HTTP URLs, analytics,
  // localStorage, fallback URLs or authentication tokens.
  return `intent://receipt?payload=${encoded}#Intent;scheme=dineosprint;package=${ANDROID_PRINT_PACKAGE};end`
}
