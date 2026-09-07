import { createServer } from 'node:net'
import { EventEmitter } from 'node:events'

const POLL_MS = 2000
const FETCH_TIMEOUT_MS = 1500

export interface TunnelMetricsSnapshot {
  tunnelId: string
  at: string
  reachable: boolean
  concurrentRequests?: number
  haConnections?: number
  /** Requests observed since the previous poll (counter delta), not a lifetime total. */
  requestsInInterval?: number
  errorsInInterval?: number
}

/**
 * Grabs an OS-assigned free TCP port and immediately releases it, so a
 * `cloudflared --metrics 127.0.0.1:<port>` we are about to spawn has a port
 * to bind that we already know. Small TOCTOU race between release and the
 * child binding it — acceptable for a local dev tool with one tunnel at a time.
 */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address()
      const port = typeof address === 'object' && address ? address.port : 0
      srv.close(() => resolve(port))
    })
  })
}

/** Parses Prometheus text exposition format, summing all label combinations for a metric name. */
function parsePrometheusText(text: string): Map<string, number> {
  const sums = new Map<string, number>()
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([0-9.eE+\-]+|NaN|\+Inf|-Inf)\s*$/)
    if (!match) continue
    const [, name, , rawValue] = match
    const value = rawValue === 'NaN' || rawValue === '+Inf' || rawValue === '-Inf' ? 0 : Number(rawValue)
    if (!Number.isFinite(value)) continue
    sums.set(name, (sums.get(name) ?? 0) + value)
  }
  return sums
}

/**
 * Polls each registered tunnel's local `cloudflared --metrics` endpoint.
 * cloudflared has no per-request trace API, so this is deliberately an
 * aggregate health snapshot (concurrent requests, error rate) — attached to a
 * trace as context for "was the tunnel healthy right now," never presented as
 * per-request timing.
 */
export class TunnelMetricsMonitor extends EventEmitter {
  private ports = new Map<string, number>()
  private counters = new Map<string, { requests: number; errors: number }>()
  private snapshots = new Map<string, TunnelMetricsSnapshot>()
  private timer: NodeJS.Timeout | null = null

  register(tunnelId: string, port: number): void {
    this.ports.set(tunnelId, port)
    if (!this.timer) {
      this.timer = setInterval(() => void this.pollAll(), POLL_MS)
      this.timer.unref?.()
    }
  }

  unregister(tunnelId: string): void {
    this.ports.delete(tunnelId)
    this.counters.delete(tunnelId)
    this.snapshots.delete(tunnelId)
    if (this.ports.size === 0 && this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  getSnapshot(tunnelId: string): TunnelMetricsSnapshot | undefined {
    return this.snapshots.get(tunnelId)
  }

  list(): Array<{ tunnelId: string; metricsPort: number; reachable: boolean }> {
    return [...this.ports.entries()].map(([tunnelId, metricsPort]) => ({
      tunnelId,
      metricsPort,
      reachable: this.snapshots.get(tunnelId)?.reachable ?? false,
    }))
  }

  private async pollAll(): Promise<void> {
    await Promise.all([...this.ports.entries()].map(([tunnelId, port]) => this.poll(tunnelId, port)))
  }

  private async poll(tunnelId: string, port: number): Promise<void> {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/metrics`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`metrics endpoint returned ${res.status}`)
      const text = await res.text()
      const metrics = parsePrometheusText(text)

      const totalRequests = metrics.get('cloudflared_tunnel_total_requests') ?? 0
      const totalErrors = metrics.get('cloudflared_tunnel_request_errors') ?? 0
      const prev = this.counters.get(tunnelId) ?? { requests: totalRequests, errors: totalErrors }

      const snapshot: TunnelMetricsSnapshot = {
        tunnelId,
        at: new Date().toISOString(),
        reachable: true,
        concurrentRequests: metrics.get('cloudflared_tunnel_concurrent_requests_per_tunnel'),
        haConnections: metrics.get('cloudflared_tunnel_ha_connections'),
        requestsInInterval: Math.max(0, totalRequests - prev.requests),
        errorsInInterval: Math.max(0, totalErrors - prev.errors),
      }

      this.counters.set(tunnelId, { requests: totalRequests, errors: totalErrors })
      this.snapshots.set(tunnelId, snapshot)
      this.emit('snapshot', snapshot)
    } catch (err) {
      const snapshot: TunnelMetricsSnapshot = {
        tunnelId,
        at: new Date().toISOString(),
        reachable: false,
      }
      this.snapshots.set(tunnelId, snapshot)
      this.emit('snapshot', snapshot)
      void err // metrics server may not be up yet right after spawn — not worth surfacing as an error
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.ports.clear()
    this.counters.clear()
    this.snapshots.clear()
  }
}
