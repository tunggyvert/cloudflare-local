import test from 'node:test'
import assert from 'node:assert/strict'
import { PathTraceCorrelator } from '../src/core/tracing/correlator.ts'

test('PathTraceCorrelator: merges hops for the same hostname into one trace, then finalizes after the window', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const correlator = new PathTraceCorrelator()

  const trace1 = correlator.ingest({
    hostname: 'api.tung.dev',
    path: '/v1/items',
    method: 'GET',
    hop: { hop: 'worker', confidence: 'measured', label: 'my-worker', status: 'ok' },
  })
  const trace2 = correlator.ingest({
    hostname: 'api.tung.dev',
    path: '/v1/items',
    method: 'GET',
    hop: { hop: 'nginx', confidence: 'measured', label: 'api.tung.dev', status: '200' },
  })

  assert.equal(trace1.id, trace2.id, 'same hostname within the window should merge into one trace')
  assert.equal(trace2.hops.length, 2)
  assert.equal(trace2.complete, false, 'still open — window has not elapsed')

  t.mock.timers.tick(2001)

  const [finalized] = correlator.list(10)
  assert.equal(finalized.id, trace1.id)
  assert.equal(finalized.complete, true)
  assert.equal(finalized.hops.length, 2)
})

test('PathTraceCorrelator: different hostnames never merge', () => {
  const correlator = new PathTraceCorrelator()
  const a = correlator.ingest({ hostname: 'a.tung.dev', hop: { hop: 'worker', confidence: 'measured', label: 'w' } })
  const b = correlator.ingest({ hostname: 'b.tung.dev', hop: { hop: 'worker', confidence: 'measured', label: 'w' } })
  assert.notEqual(a.id, b.id)
  correlator.stop()
})

test('PathTraceCorrelator: a path change on an already multi-hop bucket starts a new trace instead of merging', () => {
  const correlator = new PathTraceCorrelator()
  const first = correlator.ingest({ hostname: 'api.tung.dev', path: '/a', hop: { hop: 'worker', confidence: 'measured', label: 'w1' } })
  correlator.ingest({ hostname: 'api.tung.dev', path: '/a', hop: { hop: 'nginx', confidence: 'measured', label: 'n1' } })
  const second = correlator.ingest({ hostname: 'api.tung.dev', path: '/b', hop: { hop: 'worker', confidence: 'measured', label: 'w2' } })

  assert.notEqual(first.id, second.id)
  assert.equal(second.hops.length, 1)
  correlator.stop()
})

test('PathTraceCorrelator: clear() finalizes every open trace and empties history', () => {
  const correlator = new PathTraceCorrelator()
  correlator.ingest({ hostname: 'api.tung.dev', hop: { hop: 'worker', confidence: 'measured', label: 'w' } })
  correlator.clear()
  assert.equal(correlator.list(10).length, 0)
})

test('PathTraceCorrelator: history is capped at 500 traces', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const correlator = new PathTraceCorrelator()
  for (let i = 0; i < 510; i++) {
    correlator.ingest({ hostname: `host${i}.dev`, hop: { hop: 'worker', confidence: 'measured', label: 'w' } })
  }
  // Each hostname is its own bucket, so advancing past the window finalizes all 510 at once.
  t.mock.timers.tick(2001)
  assert.equal(correlator.list(1000).length, 500)
  correlator.stop()
})
