import test from 'node:test'
import assert from 'node:assert/strict'
import { QuickTunnelManager, normalizeTargetUrl } from '../src/core/quick-tunnel.ts'
import { LocalCacheStore } from '../src/core/cache/store.ts'

class MockSupervisor {
  events = []
  on() {}
  spawn() {}
  async stop() { return true }
}

test('QuickTunnel: normalizeTargetUrl properly formats port and urls', () => {
  assert.equal(normalizeTargetUrl('3000'), 'http://localhost:3000')
  assert.equal(normalizeTargetUrl('8080'), 'http://localhost:8080')
  assert.equal(normalizeTargetUrl('localhost:5173'), 'http://localhost:5173')
  assert.equal(normalizeTargetUrl('http://127.0.0.1:4000'), 'http://127.0.0.1:4000')
  assert.equal(normalizeTargetUrl('https://example.local'), 'https://example.local')
  assert.equal(normalizeTargetUrl(''), 'http://localhost:3000')
})

test('QuickTunnel: custom domain start and stop lifecycle with unexpose', async () => {
  const supervisor = new MockSupervisor()
  const cache = new LocalCacheStore(':memory:')

  let exposedParams = null
  let unexposedParams = null

  const mockCloudflare = {
    async exposeHostname(params) {
      exposedParams = params
      return { ok: true, ingressAdded: true, dnsCreated: true, hostname: params.hostname }
    },
    async unexposeHostname(params) {
      unexposedParams = params
      return { ok: true, ingressRemoved: true, dnsDeleted: true }
    }
  }

  const manager = new QuickTunnelManager(supervisor, () => mockCloudflare, cache)

  // Start custom domain quick tunnel
  const tunnel = await manager.start('3000', {
    mode: 'custom_domain',
    customDomain: {
      tunnelId: 'test-tunnel-id',
      hostname: 'dev.tunggyvert.com',
      zoneId: 'test-zone-id'
    }
  })

  assert.equal(tunnel.tunnelType, 'custom_domain')
  assert.equal(tunnel.status, 'running')
  assert.equal(tunnel.publicUrl, 'https://dev.tunggyvert.com')
  assert.equal(tunnel.targetUrl, 'http://localhost:3000')
  assert.deepEqual(exposedParams, {
    tunnelId: 'test-tunnel-id',
    hostname: 'dev.tunggyvert.com',
    service: 'http://localhost:3000',
    zoneId: 'test-zone-id'
  })

  // Verify list() returns it
  const list = manager.list()
  assert.equal(list.length, 1)
  assert.equal(list[0].id, tunnel.id)

  // Stop custom domain quick tunnel
  const stopped = await manager.stop(tunnel.id)
  assert.equal(stopped, true)
  assert.equal(manager.get(tunnel.id)?.status, 'stopped')
  assert.deepEqual(unexposedParams, {
    tunnelId: 'test-tunnel-id',
    hostname: 'dev.tunggyvert.com',
    zoneId: 'test-zone-id',
    deleteDns: true
  })

  cache.close()
})
