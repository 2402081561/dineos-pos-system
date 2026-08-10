import { formatCurrency } from './currency'

export function getReceiptDetails(receipt) {
  const orders = receipt?.orders ?? []
  const items = orders.flatMap((order) => order.items ?? [])
  return {
    cashier: receipt?.cashierId ? `Cashier ${String(receipt.cashierId).slice(0, 8).toUpperCase()}` : '—',
    customers: [...new Set(orders.map((order) => order.customerNickname || 'Guest'))],
    items,
    serviceCharge: orders.reduce((sum, order) => sum + (Number(order.serviceCharge) || 0), 0),
    sst: orders.reduce((sum, order) => sum + (Number(order.sst) || 0), 0),
    subtotal: orders.reduce((sum, order) => sum + (Number(order.subtotal) || 0), 0),
  }
}

function pdfText(value) {
  return String(value ?? '').replace(/[^\x20-\x7E]/g, '?').replace(/[\\()]/g, '\\$&')
}

export function downloadReceiptPdf(receipt) {
  const details = getReceiptDetails(receipt)
  const paidDate = receipt.paidAt?.toDate?.() ?? new Date()
  const lines = [
    'DineOS Restaurant',
    'Receipt',
    `Receipt: ${receipt.receiptNumber}`,
    `Date: ${paidDate.toLocaleDateString('en-MY')} ${paidDate.toLocaleTimeString('en-MY')}`,
    `Table: ${receipt.tableNumber}`,
    `Customer(s): ${details.customers.join(', ')}`,
    `Cashier: ${details.cashier}`,
    `Payment: ${receipt.paymentMethod}`,
    '----------------------------------------',
    ...details.items.map((item) => `${item.quantity}x ${item.name}  ${formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 0))}`),
    '----------------------------------------',
    `Subtotal: ${formatCurrency(details.subtotal)}`,
    `Service charge: ${formatCurrency(details.serviceCharge)}`,
    `SST: ${formatCurrency(details.sst)}`,
    `Grand total: ${formatCurrency(receipt.grandTotal)}`,
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
