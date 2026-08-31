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
      // Use token/verify instead of accounts.get — the latter requires the
      // "Account Settings: Read" permission which this app doesn't need or
      // ask the user to grant, causing a 403 (error 9109) on validation.
      const verify = await this.client.user.tokens.verify()
      if (verify.status !== 'active') {
        return { ok: false, detail: `token status: ${verify.status}` }
      }
      // Confirm the accountId is reachable with the granted permissions by
      // listing tunnels (the app already requires Tunnel:Read).
      const tunnels = this.client.zeroTrust.tunnels.list({
        account_id: this.cfg.accountId,
        per_page: 1,
      })
      // Consume at most one item to prove access works.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _t of tunnels) break
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

  async listZones(): Promise<Array<{ id: string; name: string }>> {
    const out: Array<{ id: string; name: string }> = []
    const zoneIds = this.cfg.zoneIds?.length ? this.cfg.zoneIds : undefined

    for await (const z of this.client.zones.list()) {
      if (z.id && z.name) {
        if (!zoneIds || zoneIds.includes(z.id)) {
          out.push({ id: z.id, name: z.name })
        }
      }
    }
    return out
  }

  private async allZoneIds(): Promise<string[]> {
    const ids: string[] = []
    for await (const z of this.client.zones.list()) if (z.id) ids.push(z.id)
    return ids
  }

  /**
   * Exposes an origin service at a real public hostname:
   * 1. Adds or updates the ingress rule on the remotely-managed Cloudflare tunnel.
   * 2. Creates or updates the proxied DNS CNAME record pointing at <tunnel-uuid>.cfargotunnel.com.
   */
  async exposeHostname(params: {
    tunnelId: string
    hostname: string
    service: string
    path?: string
    zoneId?: string
  }): Promise<{ ok: boolean; ingressAdded: boolean; dnsCreated: boolean; hostname: string }> {
    const { tunnelId, hostname, service, path } = params
    if (!tunnelId) throw new Error('Tunnel ID is required')
    if (!hostname) throw new Error('Hostname is required')
    if (!service) throw new Error('Origin service is required')

    let ingressAdded = false
    let dnsCreated = false

    // 1. Ingress Rule in Tunnel Configuration
    try {
      const existing = await this.client.zeroTrust.tunnels.cloudflared.configurations.get(
        tunnelId,
        { account_id: this.cfg.accountId }
      )
      const currentIngress = (existing?.config?.ingress ?? []) as Array<{
        hostname?: string
        path?: string
        service: string
      }>

      // Remove existing rule for this hostname/path if already present to update it
      const filtered = currentIngress.filter(
        (rule) => !(rule.hostname === hostname && (rule.path || undefined) === (path || undefined))
      )

      // Ensure the 404 catch-all is at the end, or create one if none exists
      const catchAll = filtered.find((r) => !r.hostname) ?? { service: 'http_status:404' }
      const nonCatchAll = filtered.filter((r) => r.hostname)

      const newRule: { hostname: string; service: string; path?: string } = {
        hostname,
        service,
      }
      if (path) newRule.path = path

      const updatedIngress = [...nonCatchAll, newRule, catchAll]

      await this.client.zeroTrust.tunnels.cloudflared.configurations.update(
        tunnelId,
        {
          account_id: this.cfg.accountId,
          config: {
            ...existing?.config,
            ingress: updatedIngress as unknown as Array<{ hostname: string; service: string; path?: string }>,
          },
        }
      )
      ingressAdded = true
    } catch (err) {
      throw new Error(`Failed to update tunnel ingress configuration: ${err instanceof Error ? err.message : String(err)}`)
    }

    // 2. DNS CNAME Record in Zone
    try {
      let targetZoneId = params.zoneId
      if (!targetZoneId) {
        // Auto-detect zone by finding matching suffix (longest match)
        const zones = await this.listZones()
        const matched = zones
          .filter((z) => hostname === z.name || hostname.endsWith(`.${z.name}`))
          .sort((a, b) => b.name.length - a.name.length)[0]
        if (matched) {
          targetZoneId = matched.id
        }
      }

      if (targetZoneId) {
        const cnameTarget = `${tunnelId}.cfargotunnel.com`
        let existingRecordId: string | null = null

        for await (const r of this.client.dns.records.list({
          zone_id: targetZoneId,
          type: 'CNAME',
          name: { exact: hostname },
        })) {
          if (r.type === 'CNAME') {
            existingRecordId = r.id ?? null
            break
          }
        }

        if (existingRecordId) {
          await this.client.dns.records.update(existingRecordId, {
            zone_id: targetZoneId,
            type: 'CNAME',
            name: hostname,
            content: cnameTarget,
            proxied: true,
            ttl: 1,
          })
        } else {
          await this.client.dns.records.create({
            zone_id: targetZoneId,
            type: 'CNAME',
            name: hostname,
            content: cnameTarget,
            proxied: true,
            ttl: 1,
          })
        }
        dnsCreated = true
      }
    } catch (err) {
      throw new Error(`Ingress configured, but DNS record update failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    return { ok: true, ingressAdded, dnsCreated, hostname }
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
