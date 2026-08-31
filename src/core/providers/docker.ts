import { EventEmitter } from 'node:events'
import Docker from 'dockerode'
import { parseDockFlareLabels } from './docker-labels'
import type { Provider } from './types'
import type { ApplyResult, Change, IaCFragment, Origin, Resource } from '../../shared/model'

export interface ContainerLifecycleEvent {
  action: 'start' | 'stop' | 'die' | 'destroy' | 'create' | 'rename' | string
  containerId: string
  name?: string
  image?: string
  at: string
}

export class DockerProvider extends EventEmitter implements Provider {
  readonly id = 'docker' as const
  readonly label = 'Docker'

  private docker: Docker
  private eventStream: NodeJS.ReadableStream | null = null
  private listening = false
  private reconnectTimer: NodeJS.Timeout | null = null

  constructor(socketPath?: string) {
    super()
    this.docker = socketPath ? new Docker({ socketPath }) : new Docker()
  }

  async available() {
    try {
      const info = await this.docker.ping()
      return { ok: true, detail: String(info) }
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'docker unreachable' }
    }
  }

  /**
   * Start listening to real-time container lifecycle events from Docker daemon.
   */
  async startEventListener(): Promise<void> {
    if (this.listening) return
    this.listening = true
    await this.attachEventStream()
  }

  private async attachEventStream(): Promise<void> {
    if (!this.listening) return
    try {
      const avail = await this.available()
      if (!avail.ok) {
        this.scheduleReconnect()
        return
      }

      const stream = await this.docker.getEvents({
        filters: { type: ['container'] },
      })
      this.eventStream = stream

      let buffer = ''
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const raw = JSON.parse(line) as {
              Type?: string
              Action?: string
              Actor?: { ID?: string; Attributes?: { name?: string; image?: string } }
              time?: number
            }
            if (raw.Type === 'container' && raw.Action && raw.Actor?.ID) {
              const event: ContainerLifecycleEvent = {
                action: raw.Action,
                containerId: raw.Actor.ID,
                name: raw.Actor.Attributes?.name,
                image: raw.Actor.Attributes?.image,
                at: raw.time ? new Date(raw.time * 1000).toISOString() : new Date().toISOString(),
              }
              this.emit('container', event)
            }
          } catch {
            // ignore JSON parse error on incomplete chunks
          }
        }
      })

      stream.on('error', () => {
        this.cleanupEventStream()
        this.scheduleReconnect()
      })

      stream.on('end', () => {
        this.cleanupEventStream()
        this.scheduleReconnect()
      })
    } catch {
      this.cleanupEventStream()
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (!this.listening || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.attachEventStream()
    }, 5000)
  }

  private cleanupEventStream(): void {
    if (this.eventStream) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.eventStream as any).destroy?.()
      } catch {
        // ignore
      }
      this.eventStream = null
    }
  }

  stopEventListener(): void {
    this.listening = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.cleanupEventStream()
  }

  async discover(): Promise<Resource[]> {
    const containers = await this.docker.listContainers({ all: true })

    return containers.map((c): Resource => {
      const name = c.Names?.[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12)
      const labels = c.Labels ?? {}
      const dockflare = parseDockFlareLabels(labels)
      const origins = this.originsFor(c, name, dockflare?.port)

      return {
        id: `docker:container:${c.Id}`,
        provider: 'docker',
        type: 'container',
        name,
        origins,
        meta: {
          image: c.Image,
          status: c.Status,
          state: c.State,
          ...this.cloudflareLabels(labels),
        },
      }
    })
  }

  private originsFor(c: Docker.ContainerInfo, name: string, preferredPort?: number): Origin[] {
    const state = c.State === 'running' ? 'running' as const : 'stopped' as const
    const published = (c.Ports ?? []).filter((p) => p.PublicPort)

    if (published.length === 0) {
      const internalAddress = preferredPort ? `http://${name}:${preferredPort}` : `http://${name}`
      return [{
        id: `docker:origin:${c.Id}:internal`,
        provider: 'docker',
        name,
        address: internalAddress,
        state,
        meta: { note: 'no published port — reachable on its Docker network' },
      }]
    }

    const origins = published.map((p) => ({
      id: `docker:origin:${c.Id}:${p.PublicPort}`,
      provider: 'docker' as const,
      name,
      address: `http://localhost:${p.PublicPort}`,
      state,
      meta: { privatePort: String(p.PrivatePort), type: p.Type },
    }))

    // If preferredPort matches a published public or private port, move that origin to front
    if (preferredPort) {
      origins.sort((a, b) => {
        const aMatches = a.address.endsWith(`:${preferredPort}`) || a.meta?.privatePort === String(preferredPort)
        const bMatches = b.address.endsWith(`:${preferredPort}`) || b.meta?.privatePort === String(preferredPort)
        return aMatches === bMatches ? 0 : aMatches ? -1 : 1
      })
    }

    return origins
  }

  /** DockFlare-style labels, parsed and normalized so we can honour them without requiring them. */
  private cloudflareLabels(labels: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {}
    const parsed = parseDockFlareLabels(labels)

    if (parsed) {
      out['dockflare_enabled'] = String(parsed.enabled)
      if (parsed.hostname) out['dockflare_hostname'] = parsed.hostname
      if (parsed.tunnel) out['dockflare_tunnel'] = parsed.tunnel
      if (parsed.service) out['dockflare_service'] = parsed.service
      if (parsed.port) out['dockflare_port'] = String(parsed.port)
      if (parsed.path) out['dockflare_path'] = parsed.path
      if (parsed.noTlsVerify !== undefined) out['dockflare_no_tls_verify'] = String(parsed.noTlsVerify)

      // Retain raw matching labels
      for (const [k, v] of Object.entries(parsed.raw)) {
        out[k] = v
      }
    }

    return out
  }

  async plan(): Promise<Change[]> {
    // v0.1 is read-only for Docker. Containers are selected as origins; the
    // resulting change lands on the Cloudflare side, not here.
    return []
  }

  async apply(change: Change): Promise<ApplyResult> {
    return { changeId: change.id, ok: false, error: 'Docker provider is read-only in v0.1' }
  }

  export(change: Change): IaCFragment {
    return {
      format: 'terraform',
      filename: 'docker.tf',
      content: `# Docker resources are not managed by this tool.\n# ${change.summary}\n`,
    }
  }
}
