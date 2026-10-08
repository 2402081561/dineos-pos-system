import { receiptOrderTypeLabel } from '../../server/src/orderType.js'
import { formatCurrency } from './currency.js'
import { moneyToCents } from './cashPayment.js'

export function getReceiptDetails(receipt) {
  const orders = receipt?.orders ?? []
  const items = orders.flatMap((order) => (order.items ?? []).map((item) => ({ ...item, orderType: item.orderType ?? (order.orderType === 'take_away' ? 'take_away' : 'dine_in') })))
  const receivedCents = moneyToCents(receipt?.cashReceived)
  const changeCents = moneyToCents(receipt?.changeAmount)
  const totalCents = moneyToCents(receipt?.grandTotal)
  const cashTender = receipt?.paymentMethod === 'Cash' && receivedCents !== null && changeCents !== null && totalCents !== null && receivedCents - totalCents === changeCents
    ? { received: receivedCents / 100, change: changeCents / 100 }
    : null
  return {
    cashier: receipt?.cashierName || (receipt?.cashierId ? `Cashier ${String(receipt.cashierId).slice(0, 8).toUpperCase()}` : '—'),
    customers: [...new Set(orders.map((order) => order.customerNickname || 'Guest'))],
    items,
    orderType: receiptOrderTypeLabel(orders),
    serviceCharge: orders.reduce((sum, order) => sum + (Number(order.serviceCharge) || 0), 0),
    sst: orders.reduce((sum, order) => sum + (Number(order.sst) || 0), 0),
    subtotal: orders.reduce((sum, order) => sum + (Number(order.subtotal) || 0), 0),
    discount: orders.reduce((sum, order) => sum + Math.max(0, Number(order.discountAmount) || 0), 0),
    cashTender,
  }
}

function pdfText(value) {
  return String(value ?? '').replace(/[^\x20-\x7E]/g, '?').replace(/[\\()]/g, '\\$&')
}

export function downloadReceiptPdf(receipt, shopName = 'DineOS') {
  const details = getReceiptDetails(receipt)
  const paidDate = receipt.paidAt?.toDate?.() ?? new Date(receipt.paidAt)
  const lines = [
    receipt.restaurantName || shopName,
    'Receipt',
    `Receipt: ${receipt.receiptNumber}`,
    `Date: ${paidDate.toLocaleDateString('en-MY')} ${paidDate.toLocaleTimeString('en-MY')}`,
    `Table: ${receipt.tableNumber}`,
    `Type: ${details.orderType}`,
    `Customer(s): ${details.customers.join(', ')}`,
    `Cashier: ${details.cashier}`,
    `Payment: ${receipt.paymentMethod}`,
    '----------------------------------------',
    ...details.items.map((item) => `${item.quantity}x ${item.name}${item.orderType === 'take_away' ? ' [Take away]' : ''}  ${formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 0))}`),
    '----------------------------------------',
    `Subtotal: ${formatCurrency(details.subtotal)}`,
    ...(details.discount > 0 ? [`Discount: -${formatCurrency(details.discount)}`] : []),
    ...(details.serviceCharge > 0 ? [`Service charge: ${formatCurrency(details.serviceCharge)}`] : []),
    ...(details.sst > 0 ? [`SST: ${formatCurrency(details.sst)}`] : []),
    `Grand total: ${formatCurrency(receipt.grandTotal)}`,
    ...(details.cashTender ? [`Cash received: ${formatCurrency(details.cashTender.received)}`, `Change: ${formatCurrency(details.cashTender.change)}`] : []),
    '',
    'Thank You For Dining With Us',
    'Visit Again',
  ]
  const content = ['BT', '/F1 11 Tf', '50 790 Td', ...lines.flatMap((line, index) => [index ? '0 -15 Td' : '', `(${pdfText(line)}) Tj`]).filter(Boolean), 'ET'].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${receipt.receiptNumber}.pdf`
  link.click()
  URL.revokeObjectURL(url)
}
