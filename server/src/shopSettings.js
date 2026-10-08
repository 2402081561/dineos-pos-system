import { defaultConfig, orderingAvailability, PosValidationError, validateStoreConfig } from './posRules.js'
export class ShopSettingsValidationError extends Error {}

export function shopSettingsResponse(row) {
  const config = { ...defaultConfig, ...row.config }
  return { name: row.name, config, revision: row.revision, ...orderingAvailability(config) }
}

export async function loadStoreSettings(client) {
  const { rows } = await client.query('SELECT name, config, revision FROM shop_settings WHERE id = 1 FOR SHARE')
  if (!rows[0]) throw new PosValidationError('Shop settings are unavailable. Apply the database schema.', 503)
  return shopSettingsResponse(rows[0])
}

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
      const { rows } = await pool.query('SELECT name, config, revision FROM shop_settings WHERE id = 1')
      if (!rows[0]) return response.status(503).json({ error: 'Shop settings are not initialized. Apply the database schema first.' })
      response.set('Cache-Control', 'no-store')
      return response.status(200).json({ settings: shopSettingsResponse(rows[0]) })
    } catch (error) { return next(error) }
  }
  app.get('/api/v1/public/shop-settings', readSettings)
  app.get('/api/v1/admin/shop-settings', requireAuthenticatedUser, requireRole('admin'), readSettings)
  app.patch('/api/v1/admin/shop-settings', requireAuthenticatedUser, requireRole('admin'), async (request, response, next) => {
    try {
      if (Object.hasOwn(request.body ?? {}, 'config')) {
        if (Object.keys(request.body).some((key) => !['name', 'expectedRevision', 'config'].includes(key))) throw new PosValidationError('Invalid shop settings.')
        const { name } = validateShopSettings({ name: request.body.name, expectedName: '' })
        const config = validateStoreConfig(request.body.config)
        if (!Number.isInteger(request.body.expectedRevision) || request.body.expectedRevision < 0) throw new PosValidationError('Reload the shop settings before saving.')
        const { rows } = await pool.query('UPDATE shop_settings SET name = $1, config = $2::jsonb, revision = revision + 1, updated_at = now() WHERE id = 1 AND revision = $3 RETURNING name, config, revision', [name, JSON.stringify(config), request.body.expectedRevision])
        if (!rows[0]) return response.status(409).json({ error: 'Settings changed in another window. Reload before saving.' })
        void Promise.resolve().then(() => logAuditEvent({ action: 'UPDATE_SHOP_SETTINGS', actorId: request.user.id, targetType: 'shop_settings', targetId: '1', details: { name, config, previousRevision: request.body.expectedRevision } })).catch((error) => console.error('[Shop settings] Audit failed:', error.message))
        return response.status(200).set('Cache-Control', 'no-store').json({ settings: shopSettingsResponse(rows[0]) })
      }
      const { name, expectedName } = validateShopSettings(request.body)
      const { rows } = await pool.query('UPDATE shop_settings SET name = $1, revision = revision + 1, updated_at = now() WHERE id = 1 AND name = $2 RETURNING name, config, revision', [name, expectedName])
      if (!rows[0]) return response.status(409).json({ error: 'The shop name changed in another window. Reload the current settings before saving.' })
      // Audit failures cannot turn a successful settings update into a failure.
      void Promise.resolve().then(() => logAuditEvent({ action: 'UPDATE_SHOP_SETTINGS', actorId: request.user.id, targetType: 'shop_settings', targetId: '1', details: { previousName: expectedName, name } })).catch((error) => console.error('[Shop settings] Audit failed:', error.message))
      response.set('Cache-Control', 'no-store')
      return response.status(200).json({ settings: shopSettingsResponse(rows[0]) })
    } catch (error) {
      if (error instanceof ShopSettingsValidationError) return response.status(400).json({ error: error.message })
      if (error instanceof PosValidationError) return response.status(error.status).json({ error: error.message })
      return next(error)
    }
  })
}
