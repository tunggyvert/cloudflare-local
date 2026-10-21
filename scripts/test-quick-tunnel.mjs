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
    },
    async tunnelConnectionCount() {
      return 1
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

function makeCloudflare(connections) {
  const calls = { unexpose: 0 }
  return {
    calls,
    async exposeHostname(params) {
      return { ok: true, ingressAdded: true, dnsCreated: true, hostname: params.hostname }
    },
    async unexposeHostname() {
      calls.unexpose++
      return { ok: true, ingressRemoved: true, dnsDeleted: true }
    },
    async tunnelConnectionCount() {
      return connections
    }
  }
}

const domain = (hostname) => ({
  mode: 'custom_domain',
  customDomain: { tunnelId: 't1', hostname }
})

test('QuickTunnel: custom domain stays starting until a connector attaches', async () => {
  const cache = new LocalCacheStore(':memory:')
  const manager = new QuickTunnelManager(new MockSupervisor(), () => makeCloudflare(0), cache)

  const tunnel = await manager.start('3000', domain('dev.tunggyvert.com'))
  assert.equal(tunnel.status, 'starting')
  assert.match(tunnel.error, /waiting for a cloudflared connector/)

  await manager.stop(tunnel.id) // also clears the connector poll timer
  cache.close()
})

test('QuickTunnel: restarting a hostname supersedes the old row and stop keeps the live route', async () => {
  const cache = new LocalCacheStore(':memory:')
  const cloudflare = makeCloudflare(1)
  const manager = new QuickTunnelManager(new MockSupervisor(), () => cloudflare, cache)

  const first = await manager.start('3000', domain('dev.tunggyvert.com'))
  const second = await manager.start('3000', domain('dev.tunggyvert.com'))
  assert.equal(manager.get(first.id)?.status, 'stopped')
  assert.equal(manager.get(second.id)?.status, 'running')

  // Stopping the superseded row must not tear down the route the live row uses.
  await manager.stop(first.id)
  assert.equal(cloudflare.calls.unexpose, 0)
  assert.equal(manager.get(second.id)?.status, 'running')

  await manager.stop(second.id)
  assert.equal(cloudflare.calls.unexpose, 1)
  cache.close()
})

test('QuickTunnel: failed teardown is reported instead of marking the row stopped', async () => {
  const cache = new LocalCacheStore(':memory:')
  const cloudflare = makeCloudflare(1)
  cloudflare.unexposeHostname = async () => {
    throw new Error('boom')
  }
  const manager = new QuickTunnelManager(new MockSupervisor(), () => cloudflare, cache)

  const tunnel = await manager.start('3000', domain('dev.tunggyvert.com'))
  await assert.rejects(manager.stop(tunnel.id), /boom/)
  assert.equal(manager.get(tunnel.id)?.status, 'running')
  assert.match(manager.get(tunnel.id)?.error, /Teardown failed/)
  cache.close()
})
