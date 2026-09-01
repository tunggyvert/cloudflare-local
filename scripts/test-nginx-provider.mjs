import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { NginxProvider } from '../src/core/providers/nginx.ts'

test('NginxProvider: discovers server blocks as canonical Resource model', async () => {
  const tmp = join(tmpdir(), `nginx-prov-test-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })

  try {
    const confPath = join(tmp, 'nginx.conf')
    writeFileSync(
      confPath,
      `
      server {
        listen 80;
        server_name test.service.internal;

        location /api {
          proxy_pass http://localhost:8080;
        }

        location / {
          proxy_pass http://localhost:3000;
        }
      }
      `
    )

    const provider = new NginxProvider({ configPath: confPath })
    const avail = await provider.available()
    assert.equal(avail.ok, true)

    const resources = await provider.discover()
    assert.equal(resources.length, 1)

    const res = resources[0]
    assert.equal(res.provider, 'nginx')
    assert.equal(res.type, 'nginx_server')
    assert.equal(res.name, 'test.service.internal')

    // Routes
    assert.equal(res.routes?.length, 2)
    assert.equal(res.routes?.[0].hostname, 'test.service.internal')
    assert.equal(res.routes?.[0].path, '/api')
    assert.equal(res.routes?.[0].kind, 'nginx-server-block')

    // Origins
    assert.equal(res.origins?.length, 2)
    assert.equal(res.origins?.[0].address, 'http://localhost:8080')
    assert.equal(res.origins?.[1].address, 'http://localhost:3000')

    provider.stopWatcher()
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('NginxProvider: file watcher emits change event on modification', async () => {
  const tmp = join(tmpdir(), `nginx-watch-test-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })

  try {
    const confPath = join(tmp, 'nginx.conf')
    writeFileSync(
      confPath,
      `
      server {
        listen 80;
        server_name watch.dev;
      }
      `
    )

    const provider = new NginxProvider({ configPath: confPath })
    await provider.discover()
    provider.startWatcher()

    let changeEmitted = false
    provider.on('change', () => {
      changeEmitted = true
    })

    // Modify file
    await new Promise((r) => setTimeout(r, 100))
    writeFileSync(
      confPath,
      `
      server {
        listen 8080;
        server_name watch.dev;
      }
      `
    )

    // Wait for chokidar debounce
    await new Promise((r) => setTimeout(r, 400))
    assert.equal(changeEmitted, true)

    provider.stopWatcher()
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
