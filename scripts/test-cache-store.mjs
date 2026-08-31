import test from 'node:test'
import assert from 'node:assert/strict'
import { LocalCacheStore } from '../src/core/cache/store.ts'

test('LocalCacheStore: initializes and saves resources to in-memory/temp db', () => {
  const store = new LocalCacheStore(':memory:')
  
  // Initially empty
  assert.deepEqual(store.loadResources(), [])

  // Save dummy resources
  const sample = [
    {
      id: 'docker:container:123',
      provider: 'docker',
      type: 'container',
      name: 'web-app',
      origins: [{ id: 'o1', provider: 'docker', name: 'web-app', address: 'http://localhost:3000', state: 'running' }],
    },
    {
      id: 'cloudflare:tunnel:abc',
      provider: 'cloudflare',
      type: 'tunnel',
      name: 'prod-tunnel',
    },
  ]

  store.saveResources(sample)

  const loaded = store.loadResources()
  assert.equal(loaded.length, 2)
  assert.equal(loaded[0].name, 'web-app') // 'container' < 'tunnel'
  assert.equal(loaded[1].name, 'prod-tunnel')

  // Key-value metadata test
  store.setMeta('last_scan', '2026-08-31T00:00:00Z')
  assert.equal(store.getMeta('last_scan'), '2026-08-31T00:00:00Z')

  store.close()
})
