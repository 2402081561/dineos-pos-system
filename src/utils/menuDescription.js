// Presentation only: keep the saved menu data and meaningful punctuation intact.
export function menuDescription(value) {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  return !text || /^[-–—\s]+$/u.test(text) ? '' : text
}
