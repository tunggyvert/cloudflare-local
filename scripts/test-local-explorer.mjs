import test from 'node:test'
import assert from 'node:assert/strict'
import { Supervisor } from '../src/core/supervisor/process.ts'
import { LocalExplorerManager } from '../src/core/explorer/manager.ts'

test('LocalExplorerManager: stores traces and caps ring buffer', () => {
  const supervisor = new Supervisor()
  const explorer = new LocalExplorerManager(supervisor)

  for (let i = 0; i < 50; i++) {
    explorer.addTrace({
      method: 'GET',
      url: `/api/items/${i}`,
      status: 200,
      durationMs: i * 2,
    })
  }

  const traces = explorer.getTraces(10)
  assert.equal(traces.length, 10)
  assert.equal(traces[0].url, '/api/items/49') // newest first
  assert.equal(traces[0].status, 200)

  explorer.clearTraces()
  assert.equal(explorer.getTraces().length, 0)
})

test('LocalExplorerManager: starts HTTP server and receives traces via POST /trace', async () => {
  const supervisor = new Supervisor()
  const explorer = new LocalExplorerManager(supervisor)
  const testPort = 19192

  try {
    const srv = await explorer.startServer(testPort)
    assert.equal(srv.running, true)
    assert.equal(srv.port, testPort)

    let eventReceived = null
    explorer.on('trace', (t) => {
      eventReceived = t
    })

    // Send HTTP POST trace payload
    const tracePayload = {
      method: 'POST',
      url: '/v1/graphql',
      status: 200,
      durationMs: 14.2,
      headers: { 'content-type': 'application/json' },
      logs: [{ level: 'info', message: 'Executed query', timestamp: new Date().toISOString() }],
    }

    const resp = await fetch(`http://127.0.0.1:${testPort}/trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tracePayload),
    })

    assert.equal(resp.status, 200)
    const json = await resp.json()
    assert.equal(json.ok, true)
    assert.ok(json.traceId)

    assert.notEqual(eventReceived, null)
    assert.equal(eventReceived.method, 'POST')
    assert.equal(eventReceived.url, '/v1/graphql')
    assert.equal(eventReceived.durationMs, 14.2)

    // Test health endpoint
    const healthResp = await fetch(`http://127.0.0.1:${testPort}/health`)
    assert.equal(healthResp.status, 200)
    const healthJson = await healthResp.json()
    assert.equal(healthJson.running, true)
    assert.equal(healthJson.port, testPort)
    assert.equal(healthJson.traceCount, 1)
  } finally {
    await explorer.stopAll()
  }
})
