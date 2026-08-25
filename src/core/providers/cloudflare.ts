import Cloudflare from 'cloudflare'
import type { Provider } from './types'
import type { ApplyResult, Change, IaCFragment, Resource, Route } from '../../shared/model'

export interface CloudflareConfig {
  apiToken: string
  accountId: string
  /** Zones to index. Left empty means "all zones", which is slow on big accounts. */
  zoneIds?: string[]
}

/**
 * Talks to Cloudflare through the official SDK, which is generated from the same
 * OpenAPI schemas as their dashboard and Terraform provider. That is deliberate:
 * it is how this app tracks Cloudflare's release velocity instead of racing it.
 *
 * Never uses the Global API Key — scoped API tokens only.
 */
export class CloudflareProvider implements Provider {
  readonly id = 'cloudflare' as const
  readonly label = 'Cloudflare'

  private client: Cloudflare
  private cfg: CloudflareConfig

  constructor(cfg: CloudflareConfig) {
    this.cfg = cfg
    this.client = new Cloudflare({ apiToken: cfg.apiToken })
  }

  async available() {
    try {
      await this.client.accounts.get({ account_id: this.cfg.accountId })
      return { ok: true }
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'cloudflare unreachable' }
    }
  }

  async discover(): Promise<Resource[]> {
    const [tunnels, dns] = await Promise.all([
      this.discoverTunnels(),
      this.discoverDns(),
    ])
    return [...tunnels, ...dns]
  }

  private async discoverTunnels(): Promise<Resource[]> {
    const out: Resource[] = []

    for await (const t of this.client.zeroTrust.tunnels.list({
      account_id: this.cfg.accountId,
      is_deleted: false,
    })) {
      const id = t.id ?? ''
      const routes = await this.ingressRoutesFor(id)

      out.push({
        id: `cloudflare:tunnel:${id}`,
        provider: 'cloudflare',
        type: 'tunnel',
        name: t.name ?? id,
        routes,
        meta: {
          tunnelId: id,
          // 'healthy' | 'degraded' | 'down' | 'inactive' — 'inactive' means no
          // cloudflared has ever connected, the strongest orphan signal we get.
          status: String(t.status ?? 'unknown'),
          connections: String(t.connections?.length ?? 0),
          createdAt: String(t.created_at ?? ''),
        },
      })
    }

    return out
  }

  /** Ingress rules of a remotely-managed tunnel, as Routes. */
  private async ingressRoutesFor(tunnelId: string): Promise<Route[]> {
    try {
      const cfg = await this.client.zeroTrust.tunnels.cloudflared.configurations.get(
        tunnelId,
        { account_id: this.cfg.accountId },
      )
      const ingress = (cfg?.config as { ingress?: Array<{ hostname?: string; path?: string; service?: string }> })?.ingress ?? []

      return ingress
        .filter((r) => r.hostname)
        .map((r, i): Route => ({
          id: `cloudflare:ingress:${tunnelId}:${i}`,
          provider: 'cloudflare',
          hostname: r.hostname!,
          path: r.path,
          kind: 'tunnel-ingress',
        }))
    } catch {
      // Locally-managed tunnels keep ingress in a config file on disk, not the
      // API. Those are read by the nginx/file adapter instead.
      return []
    }
  }

  private async discoverDns(): Promise<Resource[]> {
    const out: Resource[] = []
    const zoneIds = this.cfg.zoneIds?.length ? this.cfg.zoneIds : await this.allZoneIds()

    for (const zoneId of zoneIds) {
      for await (const r of this.client.dns.records.list({ zone_id: zoneId })) {
        // Only CNAMEs pointing at the tunnel domain matter for our purposes.
        const content = String((r as { content?: string }).content ?? '')
        if (r.type !== 'CNAME' || !content.endsWith('.cfargotunnel.com')) continue

        out.push({
          id: `cloudflare:dns:${zoneId}:${r.id}`,
          provider: 'cloudflare',
          type: 'dns_record',
          name: r.name ?? '',
          routes: [{
            id: `cloudflare:dnsroute:${r.id}`,
            provider: 'cloudflare',
            hostname: r.name ?? '',
            kind: 'dns-record',
          }],
          meta: {
            zoneId,
            recordId: String(r.id ?? ''),
            content,
            // The tunnel UUID this record points at — used for orphan detection.
            pointsAtTunnel: content.replace('.cfargotunnel.com', ''),
            proxied: String((r as { proxied?: boolean }).proxied ?? ''),
          },
        })
      }
    }

    return out
  }

  private async allZoneIds(): Promise<string[]> {
    const ids: string[] = []
    for await (const z of this.client.zones.list()) if (z.id) ids.push(z.id)
    return ids
  }

  async plan(): Promise<Change[]> {
    // v0.5 work. The plan engine lives in ../plan.ts and calls into providers;
    // this stub keeps the interface honest until then.
    return []
  }

  async apply(change: Change): Promise<ApplyResult> {
    if (change.provider !== 'cloudflare') {
      return { changeId: change.id, ok: false, error: 'wrong provider' }
    }

    try {
      if (change.resourceType === 'dns_record' && change.action === 'delete') {
        const zoneId = change.fields.find((f) => f.path === 'zoneId')?.before
        const recordId = change.fields.find((f) => f.path === 'recordId')?.before
        if (!zoneId || !recordId) throw new Error('missing zoneId/recordId on change')
        await this.client.dns.records.delete(recordId, { zone_id: zoneId })
        return { changeId: change.id, ok: true }
      }

      if (change.resourceType === 'tunnel' && change.action === 'delete') {
        const tunnelId = change.fields.find((f) => f.path === 'tunnelId')?.before
        if (!tunnelId) throw new Error('missing tunnelId on change')
        // delete/create/get live on the `cloudflared` subresource; only `list`
        // is on `tunnels` itself (it spans cloudflared + WARP connector tunnels).
        await this.client.zeroTrust.tunnels.cloudflared.delete(tunnelId, { account_id: this.cfg.accountId })
        return { changeId: change.id, ok: true }
      }

      return { changeId: change.id, ok: false, error: `unsupported change: ${change.action} ${change.resourceType}` }
    } catch (err) {
      return { changeId: change.id, ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  export(change: Change, format: IaCFragment['format']): IaCFragment {
    if (format === 'alchemy') {
      return {
        format,
        filename: 'alchemy.run.ts',
        content: `// ${change.summary}\n// TODO(v0.5): emit Alchemy resource for ${change.resourceType}\n`,
      }
    }
    return {
      format: 'terraform',
      filename: 'cloudflare.tf',
      content: `# ${change.summary}\n# TODO(v0.5): emit cloudflare_${change.resourceType} resource\n`,
    }
  }
}
