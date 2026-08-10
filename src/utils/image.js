const placeholderImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"%3E%3Crect width="640" height="480" fill="%23f1f5f9"/%3E%3Cpath d="M224 300l54-64 43 48 32-37 63 73H224z" fill="%23cbd5e1"/%3E%3Ccircle cx="387" cy="181" r="24" fill="%23cbd5e1"/%3E%3Cpath d="M172 116h296a20 20 0 0120 20v208a20 20 0 01-20 20H172a20 20 0 01-20-20V136a20 20 0 0120-20z" fill="none" stroke="%2394a3b8" stroke-width="14"/%3E%3C/svg%3E'

export function getImageSource(imageUrl) {
  return typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : placeholderImage
}

export function useImageFallback(event) {
  event.currentTarget.onerror = null
  event.currentTarget.src = placeholderImage
}
