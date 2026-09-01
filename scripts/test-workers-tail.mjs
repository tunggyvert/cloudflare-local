import test from 'node:test'
import assert from 'node:assert/strict'
import { WorkerTailManager } from '../src/core/workers/tail.ts'

test('WorkerTailManager: normalizes raw Worker tail message into structured event', () => {
  const manager = new WorkerTailManager(() => null, () => null)

  // Test normalizing raw trace message
  const rawMsg = {
    outcome: 'ok',
    eventTimestamp: 1725000000000,
    executionTimeMs: 12.5,
    event: {
      request: {
        method: 'POST',
        url: 'https://api.myworker.workers.dev/users',
        headers: { 'user-agent': 'curl/7.88.1' },
      },
      response: {
        status: 201,
      },
    },
    logs: [
      { level: 'info', message: ['Created new user in D1'], timestamp: 1725000000010 },
      { level: 'debug', message: ['Cached key in KV: user_123'], timestamp: 1725000000012 },
    ],
    exceptions: [],
  }

  const event = manager.normalizeTailMessage('my-worker', 'tail-123', rawMsg)

  assert.equal(event.scriptName, 'my-worker')
  assert.equal(event.outcome, 'ok')
  assert.equal(event.request.method, 'POST')
  assert.equal(event.request.url, 'https://api.myworker.workers.dev/users')
  assert.equal(event.response.status, 201)
  assert.equal(event.executionTimeMs, 12.5)
  assert.equal(event.logs.length, 2)
  assert.equal(event.logs[0].level, 'info')
  assert.deepEqual(event.logs[0].message, ['Created new user in D1'])
  assert.equal(event.exceptions.length, 0)
})

test('WorkerTailManager: normalizes exception logs and errors', () => {
  const manager = new WorkerTailManager(() => null, () => null)

  const rawMsg = {
    outcome: 'exception',
    eventTimestamp: 1725000000000,
    event: {
      request: {
        method: 'GET',
        url: 'https://api.myworker.workers.dev/crash',
      },
      response: {
        status: 500,
      },
    },
    logs: [],
    exceptions: [
      { name: 'TypeError', message: 'Cannot read properties of undefined', timestamp: 1725000000005 },
    ],
  }

  const event = manager.normalizeTailMessage('crash-worker', 'tail-456', rawMsg)

  assert.equal(event.scriptName, 'crash-worker')
  assert.equal(event.outcome, 'exception')
  assert.equal(event.exceptions.length, 1)
  assert.equal(event.exceptions[0].name, 'TypeError')
  assert.equal(event.exceptions[0].message, 'Cannot read properties of undefined')
})
