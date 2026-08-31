import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDockFlareLabels } from '../src/core/providers/docker-labels.ts'

test('parseDockFlareLabels: returns null when no recognized labels exist', () => {
  const result = parseDockFlareLabels({ 'traefik.enable': 'true', 'com.docker.compose.project': 'app' })
  assert.equal(result, null)
})

test('parseDockFlareLabels: parses standard cloudflare.* labels', () => {
  const result = parseDockFlareLabels({
    'cloudflare.hostname': 'api.example.com',
    'cloudflare.tunnel': 'my-tunnel',
    'cloudflare.port': '8080',
    'cloudflare.path': '/v1/*',
    'cloudflare.enabled': 'true',
    'cloudflare.no_tls_verify': 'true',
  })

  assert.notEqual(result, null)
  assert.equal(result?.enabled, true)
  assert.equal(result?.hostname, 'api.example.com')
  assert.equal(result?.tunnel, 'my-tunnel')
  assert.equal(result?.port, 8080)
  assert.equal(result?.service, 'http://localhost:8080')
  assert.equal(result?.path, '/v1/*')
  assert.equal(result?.noTlsVerify, true)
})

test('parseDockFlareLabels: handles dockflare.* and cloudflare-local.* prefixes', () => {
  const result1 = parseDockFlareLabels({
    'dockflare.hostname': 'web.tung.dev',
    'dockflare.target_port': '3000',
  })
  assert.equal(result1?.hostname, 'web.tung.dev')
  assert.equal(result1?.port, 3000)
  assert.equal(result1?.service, 'http://localhost:3000')

  const result2 = parseDockFlareLabels({
    'cloudflare-local.domain': 'blog.tung.dev',
    'cloudflare-local.service': 'https://localhost:8443',
  })
  assert.equal(result2?.hostname, 'blog.tung.dev')
  assert.equal(result2?.service, 'https://localhost:8443')
})

test('parseDockFlareLabels: handles explicit disabled flags', () => {
  const result = parseDockFlareLabels({
    'cloudflare.hostname': 'ignore.example.com',
    'cloudflare.enabled': 'false',
  })
  assert.equal(result?.enabled, false)
  assert.equal(result?.hostname, 'ignore.example.com')
})
