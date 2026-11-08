import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'

// Observability only: no database queries, outbound requests, credentials,
// request URLs, user data, or changes to error/retry/shutdown behaviour.
export function createRuntimeDiagnostics({
  logger = console,
  clock = () => performance.now(),
  memory = () => process.memoryUsage(),
  uptime = () => process.uptime(),
  schedule = setInterval,
  cancel = clearInterval,
  intervalMs = 60000,
} = {}) {
  const bootId = randomUUID()
  const startedAt = clock()
  let requests = 0, preflights = 0, timer = null, previousBeat = startedAt
  let attached = false, stopped = false
  function emit(event, fields = {}) {
    // Logging must never make a request or startup fail.
    try { logger.info('[API diagnostics] ' + JSON.stringify({ event, bootId, ...fields })) } catch { /* best effort */ }
  }
  emit('boot')

  function observeRequest(request, _response, next) {
    requests += 1
    if (requests === 1) emit('first_http_request')
    if (request.method === 'OPTIONS') {
      preflights += 1
      if (preflights === 1) emit('first_preflight')
    }
    next()
  }

  function attach(server, pool) {
    if (attached) return
    attached = true
    function heartbeat() {
      if (stopped) return
      const now = clock()
      const elapsed = Math.max(0, now - previousBeat)
      previousBeat = now
      const usage = memory()
      emit('heartbeat', {
        uptimeSeconds: Math.floor(uptime()),
        rssMiB: Math.round(usage.rss / 1048576),
        heapUsedMiB: Math.round(usage.heapUsed / 1048576),
        // Timer drift is a coarse clue, not a CPU utilization measurement.
        timerDelayMs: Math.round(Math.max(0, elapsed - intervalMs)),
        requests, preflights,
        poolTotal: pool.totalCount, poolIdle: pool.idleCount, poolWaiting: pool.waitingCount,
      })
    }
    function onListening() {
      if (stopped) return
      previousBeat = clock()
      emit('listening', { startupMs: Math.round(Math.max(0, previousBeat - startedAt)) })
      timer = schedule(heartbeat, intervalMs)
      // Does not keep Node alive or prevent Render's idle spin-down.
      timer.unref?.()
    }
    function onError(error) {
      emit('listen_error', { code: /^[A-Z0-9_]{1,32}$/.test(error?.code ?? '') ? error.code : 'ERROR' })
    }
    function stop() {
      if (stopped) return
      stopped = true
      if (timer !== null) cancel(timer)
      server.removeListener('listening', onListening)
      server.removeListener('error', onError)
      emit('closed')
    }
    server.once('listening', onListening)
    server.once('error', onError)
    server.once('close', stop)
  }
  return { observeRequest, attach }
}

// Liveness, NOT readiness. A 200 here does not mean the DB or ordering works.
// Keep /health unchanged as the database-aware Render health check.
export function registerLivenessRoute(app) {
  app.get('/livez', (_request, response) => {
    response.set('Cache-Control', 'no-store').status(200).json({ status: 'ok' })
  })
}
