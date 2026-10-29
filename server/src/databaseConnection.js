const networkCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EADDRNOTAVAIL', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', '57P01', '57P02', '57P03', '53300'])
const connectionMessages = new Set(['Connection terminated unexpectedly', 'Connection terminated', 'Connection terminated due to connection timeout', 'timeout exceeded when trying to connect', 'Client has encountered a connection error and is not queryable', 'Client was closed and is not queryable'])

export function databaseUnavailable(error, seen = new Set()) {
  if (!error || typeof error !== 'object' || seen.has(error)) return false
  seen.add(error)
  const missingPostgresSocket = error.code === 'ENOENT' && error.syscall === 'connect' && /\/\.s\.PGSQL\.\d+$/.test(error.address ?? error.path ?? '')
  return missingPostgresSocket || networkCodes.has(error.code) || /^08[0-9A-Z]{3}$/.test(error.code ?? '') || connectionMessages.has(error.message)
    || databaseUnavailable(error.cause, seen) || (Array.isArray(error.errors) && error.errors.some((entry) => databaseUnavailable(entry, seen)))
}

// Never log the pg Error object: idle errors include a client with credentials,
// backend secret keys and connection details attached to it.
export function logDatabaseError(logger, context, error) {
  const code = /^[A-Z0-9_]{2,32}$/.test(error?.code ?? '') ? error.code : 'CONNECTION_ERROR'
  logger.error(`[API] ${context} (${code}).`)
}

export function createDatabasePool(Pool, connectionString, logger = console) {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 8000, keepAlive: true, keepAliveInitialDelayMillis: 10000 })
  // pg removes a dead idle client itself. Do not end/recreate the entire pool,
  // terminate the process, or replay any query/transaction from these handlers.
  pool.on('error', (error) => logDatabaseError(logger, 'Database idle connection lost; later requests can reconnect', error))
  pool.on('connect', (client) => {
    // Checked-out transaction clients also emit socket errors. Their pending
    // query rejects normally, and release discards the broken client. A listener
    // prevents a second, unhandled EventEmitter error from crashing the API.
    client.on('error', (error) => logDatabaseError(logger, 'Database connection interrupted', error))
  })
  return pool
}

export function apiErrorHandler(error, _request, response, _next) {
  if (databaseUnavailable(error)) {
    logDatabaseError(console, 'Database temporarily unavailable', error)
    response.set('Cache-Control', 'no-store')
    // A 503 does NOT prove that a write did not commit. No Retry-After replay
    // policy is attached: clients must preserve their existing recovery keys.
    return response.status(503).json({ error: 'The database connection is temporarily unavailable. Your request may not be confirmed. Reconnect and check before retrying.' })
  }
  console.error('[API] Request failed (%s).', error?.name === 'Error' ? 'Error' : 'request error')
  return response.status(500).json({ error: 'The server could not complete this request.' })
}
