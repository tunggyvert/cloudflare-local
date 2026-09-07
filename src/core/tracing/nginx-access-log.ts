import { EventEmitter } from 'node:events'
import { createReadStream, existsSync, statSync } from 'node:fs'
import chokidar, { type FSWatcher } from 'chokidar'

export interface NginxAccessLogTarget {
  path: string
  /** Undefined when this file is shared by more than one server block — a line can't be attributed to a hostname. */
  hostname?: string
}

export interface NginxAccessLogEntry {
  path: string
  hostname?: string
  remoteAddr: string
  timestamp: string
  method: string
  url: string
  status: number
  bytesSent: number
  requestTimeMs?: number
  upstreamTimeMs?: number
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

/**
 * Matches nginx's default 'combined' format:
 *   $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
 * plus an optional trailing block of key=value pairs, a common convention for
 * appending `rt=$request_time urt=$upstream_response_time` to that format.
 * Deliberately shape-based rather than driven by the declared log_format name
 * — parsing nginx's variable syntax for arbitrary custom formats is out of scope.
 */
const LINE_RE = /^(\S+) \S+ \S+ \[([^\]]+)\] "([A-Z]+) (\S+)[^"]*" (\d{3}) (\d+|-)(?: "[^"]*" "[^"]*")?(?:\s+(.*))?$/

export function parseNginxTime(timeLocal: string): string | undefined {
  // e.g. 10/Oct/2023:13:55:36 +0000
  const m = timeLocal.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{2})(\d{2})$/)
  if (!m) return undefined
  const [, day, monAbbr, year, hh, mm, ss, tzH, tzM] = m
  const month = MONTHS[monAbbr]
  if (month === undefined) return undefined
  const date = new Date(`${year}-${String(month + 1).padStart(2, '0')}-${day}T${hh}:${mm}:${ss}${tzH}:${tzM}`)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export function parseAccessLogLine(line: string): Omit<NginxAccessLogEntry, 'path' | 'hostname'> | null {
  const m = line.match(LINE_RE)
  if (!m) return null
  const [, remoteAddr, timeLocal, method, url, statusStr, bytesStr, extras] = m

  let requestTimeMs: number | undefined
  let upstreamTimeMs: number | undefined
  if (extras) {
    const rt = extras.match(/\brt=([\d.]+)/)
    const urt = extras.match(/\burt=([\d.-]+)/)
    if (rt) requestTimeMs = Number(rt[1]) * 1000
    if (urt && urt[1] !== '-') upstreamTimeMs = Number(urt[1]) * 1000
  }

  return {
    remoteAddr,
    timestamp: parseNginxTime(timeLocal) ?? new Date().toISOString(),
    method,
    url,
    status: Number(statusStr),
    bytesSent: bytesStr === '-' ? 0 : Number(bytesStr),
    requestTimeMs,
    upstreamTimeMs,
  }
}

interface TailState {
  offset: number
  buffer: string
}

/**
 * Tails nginx access log files for newly-appended lines only — it seeks to
 * EOF on registration rather than replaying history, so a large existing log
 * costs nothing to pick up.
 */
export class NginxAccessLogTailer extends EventEmitter {
  private targets = new Map<string, NginxAccessLogTarget>()
  private state = new Map<string, TailState>()
  private watcher: FSWatcher | null = null

  /** Replaces the full watched set. Safe to call repeatedly as nginx config changes are detected. */
  setTargets(targets: NginxAccessLogTarget[]): void {
    const nextPaths = new Set(targets.map((t) => t.path))
    for (const path of [...this.targets.keys()]) {
      if (!nextPaths.has(path)) {
        this.targets.delete(path)
        this.state.delete(path)
      }
    }

    for (const target of targets) {
      this.targets.set(target.path, target)
      if (!this.state.has(target.path)) {
        const size = existsSync(target.path) ? statSync(target.path).size : 0
        this.state.set(target.path, { offset: size, buffer: '' })
      }
    }

    this.restartWatcher()
  }

  list(): Array<{ path: string; hostname?: string; watching: boolean }> {
    return [...this.targets.values()].map((t) => ({ ...t, watching: this.watcher !== null }))
  }

  private restartWatcher(): void {
    if (this.watcher) {
      void this.watcher.close()
      this.watcher = null
    }
    const paths = [...this.targets.keys()]
    if (paths.length === 0) return

    const watcher = chokidar.watch(paths, { ignoreInitial: true })
    watcher.on('change', (path) => this.onChange(path))
    watcher.on('error', (err) => this.emit('error', err instanceof Error ? err.message : String(err)))
    this.watcher = watcher
  }

  private onChange(path: string): void {
    const state = this.state.get(path)
    const target = this.targets.get(path)
    if (!state || !target) return

    let size: number
    try {
      size = statSync(path).size
    } catch {
      return
    }

    if (size < state.offset) {
      // Truncated in place (copytruncate-style rotation) — resume from the new start.
      state.offset = 0
      state.buffer = ''
    }
    if (size === state.offset) return

    const stream = createReadStream(path, { start: state.offset, end: size - 1, encoding: 'utf8' })
    let chunkData = ''
    stream.on('data', (chunk) => { chunkData += chunk })
    stream.on('end', () => {
      state.offset = size
      state.buffer += chunkData
      const lines = state.buffer.split('\n')
      state.buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const parsed = parseAccessLogLine(line)
        if (!parsed) continue
        this.emit('access', { path, hostname: target.hostname, ...parsed } satisfies NginxAccessLogEntry)
      }
    })
    stream.on('error', (err) => this.emit('error', err instanceof Error ? err.message : String(err)))
  }

  stop(): void {
    if (this.watcher) {
      void this.watcher.close()
      this.watcher = null
    }
    this.targets.clear()
    this.state.clear()
  }
}
