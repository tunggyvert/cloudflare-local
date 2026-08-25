import Docker from 'dockerode'
import type { Provider } from './types'
import type { ApplyResult, Change, IaCFragment, Origin, Resource } from '../../shared/model'

export class DockerProvider implements Provider {
  readonly id = 'docker' as const
  readonly label = 'Docker'

  private docker: Docker

  constructor(socketPath?: string) {
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

  async discover(): Promise<Resource[]> {
    const containers = await this.docker.listContainers({ all: true })

    return containers.map((c): Resource => {
      const name = c.Names?.[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12)
      const origins = this.originsFor(c, name)

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
          // Surfaced so the UI can offer "this container already asks to be exposed"
          ...this.cloudflareLabels(c.Labels ?? {}),
        },
      }
    })
  }

  private originsFor(c: Docker.ContainerInfo, name: string): Origin[] {
    const state = c.State === 'running' ? 'running' as const : 'stopped' as const
    const published = (c.Ports ?? []).filter((p) => p.PublicPort)

    if (published.length === 0) {
      return [{
        id: `docker:origin:${c.Id}:internal`,
        provider: 'docker',
        name,
        address: `http://${name}`,
        state,
        meta: { note: 'no published port — reachable on its Docker network' },
      }]
    }

    return published.map((p) => ({
      id: `docker:origin:${c.Id}:${p.PublicPort}`,
      provider: 'docker' as const,
      name,
      address: `http://localhost:${p.PublicPort}`,
      state,
      meta: { privatePort: String(p.PrivatePort), type: p.Type },
    }))
  }

  /** DockFlare-style labels, read so we can honour them without requiring them. */
  private cloudflareLabels(labels: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(labels)) {
      if (k.startsWith('cloudflare.') || k.startsWith('cloudflare-local.')) out[k] = v
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
