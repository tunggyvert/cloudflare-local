import { EventEmitter } from 'node:events'
import type { PathTrace, PathTraceHop } from '../../shared/model'

const MAX_TRACES = 500
/** How long an open trace waits for another hop before it is considered done. */
const WINDOW_MS = 2000
/** Hard cap so a trace always finalizes even if hops keep trickling in. */
const MAX_TRACE_LIFETIME_MS = 8000

export interface IngestInput {
  hostname?: string
  path?: string
  method?: string
  hop: PathTraceHop
}

interface OpenTrace {
  trace: PathTrace
  windowTimer: NodeJS.Timeout
  hardTimer: NodeJS.Timeout
}

/**
 * Correlates hop events from independent processes (Worker tail, cloudflared
 * metrics, nginx access log, docker logs) into one timeline per request.
 *
 * None of those processes share a request ID, so correlation is a heuristic:
 * hops are bucketed by hostname and merged into the same trace while they
 * arrive within WINDOW_MS of each other. A path mismatch on an
 * already-multi-hop bucket starts a new trace instead of merging, to reduce
 * (not eliminate) cross-talk between concurrent requests to the same host.
 */
export class PathTraceCorrelator extends EventEmitter {
  private open = new Map<string, OpenTrace>()
  private history: PathTrace[] = []

  ingest(input: IngestInput): PathTrace {
    const key = input.hostname || '*'
    let entry = this.open.get(key)

    if (
      entry &&
      entry.trace.path &&
      input.path &&
      entry.trace.path !== input.path &&
      entry.trace.hops.length >= 2
    ) {
      this.finalize(key)
      entry = undefined
    }

    if (!entry) {
      const trace: PathTrace = {
        id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        hostname: input.hostname,
        path: input.path,
        method: input.method,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        complete: false,
        hops: [],
      }
      entry = {
        trace,
        windowTimer: setTimeout(() => this.finalize(key), WINDOW_MS),
        hardTimer: setTimeout(() => this.finalize(key), MAX_TRACE_LIFETIME_MS),
      }
      entry.windowTimer.unref?.()
      entry.hardTimer.unref?.()
      this.open.set(key, entry)
    } else {
      clearTimeout(entry.windowTimer)
      entry.windowTimer = setTimeout(() => this.finalize(key), WINDOW_MS)
      entry.windowTimer.unref?.()
      if (!entry.trace.hostname) entry.trace.hostname = input.hostname
      if (!entry.trace.path) entry.trace.path = input.path
      if (!entry.trace.method) entry.trace.method = input.method
    }

    entry.trace.hops.push(input.hop)
    entry.trace.updatedAt = new Date().toISOString()
    this.emit('trace', entry.trace)
    return entry.trace
  }

  private finalize(key: string): void {
    const entry = this.open.get(key)
    if (!entry) return
    clearTimeout(entry.windowTimer)
    clearTimeout(entry.hardTimer)
    this.open.delete(key)

    entry.trace.complete = true
    this.history.push(entry.trace)
    if (this.history.length > MAX_TRACES) this.history.shift()
    this.emit('trace', entry.trace)
  }

  list(limit = 100, hostname?: string): PathTrace[] {
    const openTraces = [...this.open.values()].map((e) => e.trace)
    let all = [...openTraces, ...this.history]
    if (hostname) all = all.filter((t) => t.hostname === hostname)
    all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return all.slice(0, limit)
  }

  clear(): void {
    for (const key of [...this.open.keys()]) this.finalize(key)
    this.history = []
  }

  stop(): void {
    for (const entry of this.open.values()) {
      clearTimeout(entry.windowTimer)
      clearTimeout(entry.hardTimer)
    }
    this.open.clear()
  }
}
