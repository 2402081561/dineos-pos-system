export function toDate(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function startOfDay(date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

export function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function getDateRange(filter, customStart, customEnd) {
  const now = new Date()
  const today = startOfDay(now)

  if (filter === 'week') {
    const weekStart = addDays(today, -((today.getDay() + 6) % 7))
    return { start: weekStart, end: addDays(weekStart, 7), label: 'This week' }
  }
  if (filter === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1), label: 'This month' }
  if (filter === 'year') return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1), label: 'This year' }
  if (filter === 'custom' && customStart && customEnd) {
    const start = startOfDay(new Date(`${customStart}T00:00:00`))
    const end = addDays(startOfDay(new Date(`${customEnd}T00:00:00`)), 1)
    return { start, end, label: 'Custom range' }
  }
  return { start: today, end: addDays(today, 1), label: 'Today' }
}

export function isWithinRange(timestamp, range) {
  const date = toDate(timestamp)
  return Boolean(date && date >= range.start && date < range.end)
}

export function formatShortDate(date) {
  return new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short' }).format(date)
}

export function formatDateTime(timestamp) {
  const date = toDate(timestamp)
  if (!date) return 'Just now'
  return new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date)
}

export function getOrderNumber(order) {
  return order.orderNumber ?? `#${String(order.id).slice(-6).toUpperCase()}`
}

export function downloadCsv(filename, rows) {
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const content = rows.map((row) => row.map(escapeCell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
