export function startApiServer(app, port, { onError = () => { process.exitCode = 1 }, logger = console } = {}) {
  const options = process.env.DINEOS_LOOPBACK_ONLY === 'true' ? { port, host: '127.0.0.1' } : port
  return app.listen(options, (error) => {
    if (error) {
      logger.error(`[API] Could not listen on port ${port} (${error.code || 'startup error'}).`)
      onError(error)
      return
    }
    logger.info(`[API] DineOS PostgreSQL API listening on port ${port}`)
  })
}
