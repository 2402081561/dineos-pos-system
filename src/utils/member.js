// Malaysian local numbers beginning with 0 are stored as +60. International
// numbers must include their + country prefix so that they are not guessed.
export function normalizeMemberPhone(value) {
  const compact = String(value ?? '').trim().replace(/[\s().-]/g, '')
  if (!compact) return ''

  if (/^0\d+$/.test(compact)) return `+60${compact.slice(1)}`
  if (/^60\d+$/.test(compact)) return `+${compact}`
  if (/^\+\d+$/.test(compact)) return compact
  return ''
}

export function isValidMemberPhone(value) {
  const normalized = normalizeMemberPhone(value)
  if (!normalized) return false
  if (normalized.startsWith('+60')) return /^\+601\d{7,9}$/.test(normalized)
  return /^\+\d{8,15}$/.test(normalized)
}

export function isValidMemberEmail(value) {
  const email = String(value ?? '').trim()
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
