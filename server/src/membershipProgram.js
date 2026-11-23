import { loadStoreSettings } from './shopSettings.js'
import { PosValidationError } from './posRules.js'

export const membershipPausedMessage = 'Membership and rewards are currently paused. You can still order as Guest.'
export async function requireMembershipProgram(client) {
  const settings = await loadStoreSettings(client)
  if (settings.config.membershipEnabled !== true) throw new PosValidationError(membershipPausedMessage, 503)
  return settings
}
export function membershipProgramGuard(pool) {
  return async (_request, response, next) => {
    try { await requireMembershipProgram(pool); return next() }
    catch (error) {
      if (error instanceof PosValidationError) return response.status(error.status).json({ error: error.message })
      return next(error)
    }
  }
}
