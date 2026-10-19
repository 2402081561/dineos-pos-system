import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startApiServer } from '../src/startServer.js'

test('Express listen errors never log success and signal a failed startup', () => {
  for (const code of ['EADDRINUSE', 'EACCES']) {
    const error = Object.assign(new Error('Port unavailable'), { code })
    const logs = [], failures = []
    const server = {}
    assert.equal(startApiServer({ listen(port, callback) { assert.equal(port, 4000); callback(error); return server } }, 4000, {
      logger: { error: (message) => logs.push(message), info: () => assert.fail('Must not claim success') },
      onError: (failure) => failures.push(failure),
    }), server)
    assert.equal(failures[0], error)
    assert.match(logs[0], new RegExp(code))
  }
})

test('successful startup logs the port exactly once and never invokes failure cleanup', () => {
  const logs = []
  startApiServer({ listen(_port, callback) { callback() } }, 4000, {
    logger: { info: (message) => logs.push(message), error: () => assert.fail() }, onError: () => assert.fail(),
  })
  assert.deepEqual(logs, ['[API] DineOS PostgreSQL API listening on port 4000'])
})

test('default startup failure has a nonzero process exit status', () => {
  const previous = process.exitCode
  try {
    startApiServer({ listen(_port, callback) { callback({ code: 'EADDRINUSE' }) } }, 4000, { logger: { error() {} } })
    assert.equal(process.exitCode, 1)
  } finally { process.exitCode = previous }
})
