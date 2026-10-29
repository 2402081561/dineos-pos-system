// Internal display alias, never a replacement for the menu/receipt identity.
export function validateKitchenName(value) {
  if (value === undefined || value === null) return null // Old clients must not clear existing aliases.
  if (typeof value !== 'string' || value.length > 40 || /[\p{Cc}\p{Cf}]/u.test(value)) throw new Error('Kitchen short name must be plain text up to 40 characters.')
  return value.trim()
}
