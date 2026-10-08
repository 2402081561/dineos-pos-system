import { authenticatedApiRequest } from './supabaseAuthService'

const apiUrl = String(import.meta.env.VITE_API_URL ?? 'http://localhost:4000').trim().replace(/\/$/, '')

export async function getShopSettings(signal) {
  const response = await fetch(`${apiUrl}/api/v1/public/shop-settings`, { signal, cache: 'no-store' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Shop settings could not be loaded. Check that the API is running and the database schema has been applied.')
  if (typeof data.settings?.name !== 'string' || !data.settings.name.trim()) throw new Error('The API returned invalid shop settings.')
  return data.settings
}

export async function updateShopSettings(settings, expectedRevision) {
  return (await authenticatedApiRequest('/api/v1/admin/shop-settings', { method: 'PATCH', body: { name: settings.name, config: settings.config, expectedRevision } })).settings
}
