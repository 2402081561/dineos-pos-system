export const DEFAULT_TABLE_STYLE = { shape: 'square', size: 'medium', orientation: 'horizontal' }

export function tableStyle(value) {
  return { ...DEFAULT_TABLE_STYLE, ...value }
}

export function validTableStyle(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => ['shape', 'size', 'orientation'].includes(key))
    && ['round', 'square', 'rectangle'].includes(value.shape)
    && ['small', 'medium', 'large'].includes(value.size)
    && ['horizontal', 'vertical'].includes(value.orientation)
}

export function sameTableStyle(first, second) {
  const a = tableStyle(first), b = tableStyle(second)
  return a.shape === b.shape && a.size === b.size && a.orientation === b.orientation
}
