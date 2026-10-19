export function startApiServer(app, port, { onError = () => { process.exitCode = 1 }, logger = console } = {}) {
  return app.listen(port, (error) => {
    if (error) {
      logger.error(`[API] Could not listen on port ${port} (${error.code || 'startup error'}).`)
      onError(error)
      return
    }
    logger.info(`[API] DineOS PostgreSQL API listening on port ${port}`)
  })
}
