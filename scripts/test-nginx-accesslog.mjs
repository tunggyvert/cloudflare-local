import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAccessLogLine, parseNginxTime } from '../src/core/tracing/nginx-access-log.ts'
import { NginxParser } from '../src/core/providers/nginx-parser.ts'

test('parseNginxTime: converts nginx time_local to ISO', () => {
  const iso = parseNginxTime('10/Oct/2023:13:55:36 +0000')
  assert.equal(iso, '2023-10-10T13:55:36.000Z')
})

test('parseNginxTime: returns undefined for malformed input', () => {
  assert.equal(parseNginxTime('not a date'), undefined)
})

test('parseAccessLogLine: parses a standard combined-format line', () => {
  const line = '127.0.0.1 - - [10/Oct/2023:13:55:36 +0000] "GET /v1/items?limit=10 HTTP/1.1" 200 512 "-" "curl/8.0"'
  const entry = parseAccessLogLine(line)
  assert.ok(entry)
  assert.equal(entry.remoteAddr, '127.0.0.1')
  assert.equal(entry.method, 'GET')
  assert.equal(entry.url, '/v1/items?limit=10')
  assert.equal(entry.status, 200)
  assert.equal(entry.bytesSent, 512)
  assert.equal(entry.requestTimeMs, undefined)
  assert.equal(entry.upstreamTimeMs, undefined)
})

test('parseAccessLogLine: captures rt=/urt= timing suffix in milliseconds', () => {
  const line =
    '10.0.0.5 - - [10/Oct/2023:13:55:36 +0000] "POST /api/orders HTTP/1.1" 201 128 "-" "app/1.0" rt=0.045 uct=0.001 uht=0.040 urt=0.044'
  const entry = parseAccessLogLine(line)
  assert.ok(entry)
  assert.equal(entry.requestTimeMs, 45)
  assert.equal(entry.upstreamTimeMs, 44)
})

test('parseAccessLogLine: leaves upstream timing undefined when upstream was not hit ("-")', () => {
  const line = '10.0.0.5 - - [10/Oct/2023:13:55:36 +0000] "GET /static/app.js HTTP/1.1" 304 0 "-" "-" rt=0.001 urt=-'
  const entry = parseAccessLogLine(line)
  assert.ok(entry)
  assert.equal(entry.requestTimeMs, 1)
  assert.equal(entry.upstreamTimeMs, undefined)
})

test('parseAccessLogLine: returns null for lines that do not match the combined shape', () => {
  assert.equal(parseAccessLogLine('this is not a log line'), null)
})

test('NginxParser: server block inherits http-level access_log, override wins', () => {
  const parser = new NginxParser()
  const content = `
    http {
      access_log /var/log/nginx/http-access.log combined;

      server {
        server_name a.tung.dev;
        listen 80;
      }

      server {
        server_name b.tung.dev;
        listen 80;
        access_log /var/log/nginx/b-access.log main;
      }

      server {
        server_name c.tung.dev;
        listen 80;
        access_log off;
      }
    }
  `
  const result = parser.parseContent(content)
  const byName = Object.fromEntries(result.servers.map((s) => [s.serverName, s]))

  assert.equal(byName['a.tung.dev'].accessLogPath, '/var/log/nginx/http-access.log')
  assert.equal(byName['a.tung.dev'].accessLogFormat, 'combined')

  assert.equal(byName['b.tung.dev'].accessLogPath, '/var/log/nginx/b-access.log')
  assert.equal(byName['b.tung.dev'].accessLogFormat, 'main')

  assert.equal(byName['c.tung.dev'].accessLogPath, undefined)
})

test('NginxParser: relative access_log paths are ignored (no reliable prefix to resolve against)', () => {
  const parser = new NginxParser()
  const content = `
    server {
      server_name relative.tung.dev;
      access_log logs/access.log combined;
    }
  `
  const result = parser.parseContent(content)
  assert.equal(result.servers[0].accessLogPath, undefined)
})
