import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { NginxParser } from '../src/core/providers/nginx-parser.ts'

test('NginxParser: parses simple server block with locations and proxy_pass', () => {
  const parser = new NginxParser()
  const content = `
    # Main HTTP server
    server {
      listen 80;
      server_name api.tung.dev;

      location / {
        proxy_pass http://localhost:3000;
      }

      location /static/ {
        root /var/www/static;
      }
    }
  `

  const result = parser.parseContent(content)
  assert.equal(result.servers.length, 1)
  const server = result.servers[0]
  assert.equal(server.serverName, 'api.tung.dev')
  assert.deepEqual(server.listen, ['80'])
  assert.equal(server.locations.length, 2)
  assert.equal(server.locations[0].path, '/')
  assert.equal(server.locations[0].proxyPass, 'http://localhost:3000')
  assert.equal(server.locations[1].path, '/static/')
  assert.equal(server.locations[1].root, '/var/www/static')
})

test('NginxParser: parses multiple server blocks and upstream definitions', () => {
  const parser = new NginxParser()
  const content = `
    upstream backend_pool {
      server 127.0.0.1:8080;
      server 127.0.0.1:8081;
    }

    server {
      listen 80;
      server_name web.tung.dev;

      location /api {
        proxy_pass http://backend_pool;
      }
    }

    server {
      listen 443 ssl;
      server_name secure.tung.dev;

      location / {
        proxy_pass http://localhost:4000;
      }
    }
  `

  const result = parser.parseContent(content)
  assert.equal(result.upstreams.length, 1)
  assert.equal(result.upstreams[0].name, 'backend_pool')
  assert.deepEqual(result.upstreams[0].servers, ['127.0.0.1:8080', '127.0.0.1:8081'])

  assert.equal(result.servers.length, 2)
  assert.equal(result.servers[0].serverName, 'web.tung.dev')
  assert.equal(result.servers[0].locations[0].proxyPass, 'http://backend_pool')

  assert.equal(result.servers[1].serverName, 'secure.tung.dev')
  assert.deepEqual(result.servers[1].listen, ['443 ssl'])
})

test('NginxParser: handles nested files and include directives', () => {
  const tmp = join(tmpdir(), `nginx-test-${Date.now()}`)
  mkdirSync(join(tmp, 'conf.d'), { recursive: true })

  try {
    const mainConf = join(tmp, 'nginx.conf')
    const includedConf = join(tmp, 'conf.d', 'app.conf')

    writeFileSync(
      mainConf,
      `
      events {}
      http {
        include conf.d/*.conf;
      }
      `
    )

    writeFileSync(
      includedConf,
      `
      server {
        listen 8080;
        server_name app.local;

        location / {
          proxy_pass http://localhost:5000;
        }
      }
      `
    )

    const parser = new NginxParser()
    const result = parser.parseFile(mainConf)

    assert.equal(result.servers.length, 1)
    assert.equal(result.servers[0].serverName, 'app.local')
    assert.equal(result.servers[0].locations[0].proxyPass, 'http://localhost:5000')
    assert.equal(result.includedFiles.length, 2)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
