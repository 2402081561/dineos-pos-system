export class ShopSettingsValidationError extends Error {}

export function validateShopSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['name', 'expectedName'].includes(key))) {
    throw new ShopSettingsValidationError('Only the shop name can be changed.')
  }
  if (typeof input.name !== 'string' || typeof input.expectedName !== 'string') {
    throw new ShopSettingsValidationError('Provide a shop name and the previously loaded name.')
  }
  const name = input.name.trim()
  if (!name || Array.from(name).length > 80 || Array.from(name).some((character) => character.charCodeAt(0) < 32 || (character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159))) {
    throw new ShopSettingsValidationError('Shop name must contain 1 to 80 characters without line breaks or control characters.')
  }
  return { name, expectedName: input.expectedName }
}

export function registerShopSettingsRoutes(app, { pool, requireAuthenticatedUser, requireRole, logAuditEvent }) {
  async function readSettings(_request, response, next) {
    try {
      const { rows } = await pool.query('SELECT name FROM shop_settings WHERE id = 1')
      if (!rows[0]) return response.status(503).json({ error: 'Shop settings are not initialized. Apply the database schema first.' })
      response.set('Cache-Control', 'no-store')
      return response.status(200).json({ settings: { name: rows[0].name } })
    } catch (error) { return next(error) }
  }
  app.get('/api/v1/public/shop-settings', readSettings)
  app.get('/api/v1/admin/shop-settings', requireAuthenticatedUser, requireRole('admin'), readSettings)
  app.patch('/api/v1/admin/shop-settings', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
    try {
      const { name, expectedName } = validateShopSettings(request.body)
      const { rows } = await pool.query('UPDATE shop_settings SET name = $1, updated_at = now() WHERE id = 1 AND name = $2 RETURNING name', [name, expectedName])
      if (!rows[0]) return response.status(409).json({ error: 'The shop name changed in another window. Reload the current settings before saving.' })
      // Audit failures cannot turn a successful settings update into a failure.
      void Promise.resolve().then(() => logAuditEvent({ action: 'UPDATE_SHOP_SETTINGS', actorId: request.user.id, targetType: 'shop_settings', targetId: '1', details: { previousName: expectedName, name } })).catch((error) => console.error('[Shop settings] Audit failed:', error.message))
      response.set('Cache-Control', 'no-store')
      return response.status(200).json({ settings: { name: rows[0].name } })
    } catch (error) {
      if (error instanceof ShopSettingsValidationError) return response.status(400).json({ error: error.message })
      return next(error)
    }
  })
}
