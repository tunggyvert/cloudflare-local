import { EventEmitter } from 'node:events'
import { PassThrough, type Readable } from 'node:stream'
import type Docker from 'dockerode'

const MAX_LINES_PER_CONTAINER = 300
const MAX_LINE_AGE_MS = 5 * 60 * 1000

export interface ContainerLogLine {
  stream: 'stdout' | 'stderr'
  timestamp: string
  line: string
}

interface TrackedContainer {
  name: string
  lines: ContainerLogLine[]
  stop: () => void
}

/**
 * Tails `docker logs -f` for whichever containers are currently reachable as
 * an Origin behind a live Route — not every container on the host — so the
 * stream count stays bounded by what is actually in a service's request path.
 * Keeps a short ring buffer per container so a correlated trace can attach
 * whatever the container logged inside the trace's time window.
 */
export class ContainerLogTailer extends EventEmitter {
  private getClient: () => Docker | null
  private tracked = new Map<string, TrackedContainer>()

  constructor(getClient: () => Docker | null) {
    super()
    this.getClient = getClient
  }

  /** Diffs against the currently tracked set — starts new streams, stops removed ones. */
  setTracked(containers: Array<{ id: string; name: string }>): void {
    const nextIds = new Set(containers.map((c) => c.id))
    for (const id of [...this.tracked.keys()]) {
      if (!nextIds.has(id)) this.untrack(id)
    }
    for (const c of containers) {
      if (!this.tracked.has(c.id)) this.track(c.id, c.name)
    }
  }

  trackedIds(): string[] {
    return [...this.tracked.keys()]
  }

  /** Lines from this container within `windowMs` of `atIso`, oldest first. */
  linesNear(containerId: string, atIso: string, windowMs: number): ContainerLogLine[] {
    const tracked = this.tracked.get(containerId)
    if (!tracked) return []
    const at = new Date(atIso).getTime()
    return tracked.lines.filter((l) => Math.abs(new Date(l.timestamp).getTime() - at) <= windowMs)
  }

  private track(containerId: string, name: string): void {
    const docker = this.getClient()
    if (!docker) return

    const entry: TrackedContainer = { name, lines: [], stop: () => {} }
    this.tracked.set(containerId, entry)

    const container = docker.getContainer(containerId)
    container
      .logs({ follow: true, stdout: true, stderr: true, tail: 0, timestamps: true })
      .then((rawStream) => {
        // dockerode types this as the generic NodeJS.ReadableStream interface, but it is
        // always a real node:stream Readable at runtime — cast for .destroy().
        const raw = rawStream as unknown as Readable

        // May have been untracked (container removed from the path) while the request was in flight.
        if (!this.tracked.has(containerId)) {
          raw.destroy()
          return
        }

        const stdout = new PassThrough()
        const stderr = new PassThrough()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(container.modem as any).demuxStream(raw, stdout, stderr)

        stdout.on('data', (chunk: Buffer) => this.ingest(containerId, 'stdout', chunk))
        stderr.on('data', (chunk: Buffer) => this.ingest(containerId, 'stderr', chunk))

        entry.stop = () => {
          raw.destroy()
          stdout.destroy()
          stderr.destroy()
        }

        raw.on('error', () => this.untrack(containerId))
        raw.on('end', () => this.untrack(containerId))
      })
      .catch(() => this.untrack(containerId))
  }

  private ingest(containerId: string, streamName: 'stdout' | 'stderr', chunk: Buffer): void {
    const tracked = this.tracked.get(containerId)
    if (!tracked) return

    const now = Date.now()
    for (const rawLine of chunk.toString('utf8').split('\n')) {
      if (!rawLine.trim()) continue
      // `timestamps: true` prefixes each line with an RFC3339Nano timestamp.
      const match = rawLine.match(/^(\S+)\s(.*)$/)
      const timestamp = match ? match[1] : new Date(now).toISOString()
      const line = match ? match[2] : rawLine

      tracked.lines.push({ stream: streamName, timestamp, line })
      if (tracked.lines.length > MAX_LINES_PER_CONTAINER) tracked.lines.shift()
    }

    const cutoff = now - MAX_LINE_AGE_MS
    while (tracked.lines.length > 0 && new Date(tracked.lines[0].timestamp).getTime() < cutoff) {
      tracked.lines.shift()
    }

    this.emit('line', { containerId, name: tracked.name })
  }

  private untrack(containerId: string): void {
    const tracked = this.tracked.get(containerId)
    if (!tracked) return
    tracked.stop()
    this.tracked.delete(containerId)
  }

  stop(): void {
    for (const id of [...this.tracked.keys()]) this.untrack(id)
  }
}
