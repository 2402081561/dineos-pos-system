// Production stays compatible with schema 031 until upgrade 032 is approved.
// The explicit flag is only enabled after the database upgrade is verified.
export function savedTableVisitToolsEnabled(env = {}) {
  if (env.VITE_SAVED_TABLE_VISITS_ENABLED === 'false') return false
  return env.VITE_SAVED_TABLE_VISITS_ENABLED === 'true' || env.DEV === true
}

export const hasSavedTableVisitTools = savedTableVisitToolsEnabled(import.meta.env)
