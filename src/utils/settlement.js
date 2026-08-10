import { formatCurrency } from './currency'

export function settlementLines(closing) {
  return [
    'DineOS Restaurant',
    'Shift Settlement',
    `Closing ID: ${closing.closingId}`,
    `Cashier: ${closing.cashierName}`,
    `Closed: ${closing.closedAt?.toDate?.().toLocaleString('en-MY') ?? '—'}`,
    '----------------------------------------',
    `Cash: ${formatCurrency(closing.cash)}`,
    `Card: ${formatCurrency(closing.card)}`,
    `Touch n Go: ${formatCurrency(closing.touchNGo)}`,
    `GrabPay: ${formatCurrency(closing.grabPay)}`,
    `FPX: ${formatCurrency(closing.fpx)}`,
    `Other: ${formatCurrency(closing.other)}`,
    '----------------------------------------',
    `Grand total: ${formatCurrency(closing.grandTotal)}`,
    `Transactions: ${closing.transactionCount}`,
    `Average bill: ${formatCurrency(closing.averageBill)}`,
    `Highest bill: ${formatCurrency(closing.highestBill)}`,
    `Lowest bill: ${formatCurrency(closing.lowestBill)}`,
  ]
}

export function downloadSettlementPdf(closing) {
  const safeText = (value) => String(value ?? '').replace(/[^\x20-\x7E]/g, '?').replace(/[\\()]/g, '\\$&')
  const content = ['BT', '/F1 11 Tf', '50 790 Td', ...settlementLines(closing).flatMap((line, index) => [index ? '0 -15 Td' : '', `(${safeText(line)}) Tj`]).filter(Boolean), 'ET'].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${closing.closingId}.pdf`
  link.click()
  URL.revokeObjectURL(url)
}
