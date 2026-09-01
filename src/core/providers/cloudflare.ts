import Cloudflare from 'cloudflare'
import type { Provider } from './types'
import type {
  ApplyResult,
  Change,
  D1DatabaseInfo,
  D1QueryResult,
  D1TableInfo,
  IaCFragment,
  KVKeyInfo,
  KVNamespaceInfo,
  R2BucketInfo,
  R2ObjectInfo,
  Resource,
  Route,
  WorkerBinding,
  WorkerSummary,
} from '../../shared/model'

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

  getClient(): Cloudflare {
    return this.client
  }

  getAccountId(): string {
    return this.cfg.accountId
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
    const [tunnels, dns, workers] = await Promise.all([
      this.discoverTunnels(),
      this.discoverDns(),
      this.discoverWorkers().catch(() => []),
    ])
    return [...tunnels, ...dns, ...workers]
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

  /* ---- v0.3: Workers & Bindings ------------------------------------ */

  private async discoverWorkers(): Promise<Resource[]> {
    const out: Resource[] = []
    const workers = await this.listWorkers()

    for (const w of workers) {
      const routes: Route[] = []
      for (const r of w.routes ?? []) {
        routes.push({
          id: `cloudflare:workerroute:${w.name}:${r}`,
          provider: 'cloudflare',
          hostname: r.replace(/\/\*?$/, '').replace(/^https?:\/\//, ''),
          kind: 'worker-route',
        })
      }
      for (const d of w.domains ?? []) {
        routes.push({
          id: `cloudflare:workerdomain:${w.name}:${d}`,
          provider: 'cloudflare',
          hostname: d,
          kind: 'worker-domain',
        })
      }

      out.push({
        id: `cloudflare:worker:${w.name}`,
        provider: 'cloudflare',
        type: 'worker',
        name: w.name,
        routes,
        meta: {
          scriptName: w.name,
          modifiedOn: w.modifiedOn ?? '',
          createdOn: w.createdOn ?? '',
          bindingsCount: String(w.bindings?.length ?? 0),
          compatibilityDate: w.compatibilityDate ?? '',
        },
      })
    }

    return out
  }

  async listWorkers(): Promise<WorkerSummary[]> {
    const out: WorkerSummary[] = []
    try {
      for await (const s of this.client.workers.scripts.list({
        account_id: this.cfg.accountId,
      })) {
        const name = s.id ?? ''
        if (!name) continue

        const routes: string[] = []
        if (Array.isArray(s.routes)) {
          for (const r of s.routes) {
            if (typeof r === 'string') routes.push(r)
            else if (r && typeof r === 'object' && 'pattern' in r) {
              routes.push(String((r as { pattern: string }).pattern))
            }
          }
        }

        let bindings: WorkerBinding[] = []
        let compDate: string | undefined = s.compatibility_date
        try {
          const settings = await this.client.workers.scripts.scriptAndVersionSettings.get(name, {
            account_id: this.cfg.accountId,
          })
          if (settings.compatibility_date) compDate = settings.compatibility_date
          if (Array.isArray(settings.bindings)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            bindings = settings.bindings.map((b: any) => ({
              type: b.type || 'unknown',
              name: b.name || '',
              targetId: b.namespace_id || b.bucket_name || b.database_id || b.service || undefined,
              details: b,
            }))
          }
        } catch {
          /* ignore settings error on individual scripts */
        }

        out.push({
          id: name,
          name,
          createdOn: s.created_on,
          modifiedOn: s.modified_on,
          etag: s.etag,
          routes,
          bindings,
          compatibilityDate: compDate,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          logpush: (s as any).logpush ?? false,
        })
      }
    } catch {
      return []
    }
    return out
  }

  async getWorker(scriptName: string): Promise<{ worker: WorkerSummary; content?: string }> {
    let content: string | undefined
    try {
      const resp = await this.client.workers.scripts.content.get(scriptName, {
        account_id: this.cfg.accountId,
      })
      content = await resp.text()
    } catch {
      /* content may not be readable */
    }

    let summary: WorkerSummary = {
      id: scriptName,
      name: scriptName,
    }

    try {
      const s = await this.client.workers.scripts.get(scriptName, {
        account_id: this.cfg.accountId,
      })
      const settings = await this.client.workers.scripts.scriptAndVersionSettings.get(scriptName, {
        account_id: this.cfg.accountId,
      }).catch(() => null)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bindings: WorkerBinding[] = Array.isArray(settings?.bindings)
        ? (settings.bindings as unknown as Array<Record<string, unknown>>).map((b) => ({
            type: String(b.type || 'unknown'),
            name: String(b.name || ''),
            targetId: String(b.namespace_id || b.bucket_name || b.database_id || b.service || '') || undefined,
            details: b,
          }))
        : []

      summary = {
        id: scriptName,
        name: scriptName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createdOn: (s as any).created_on,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        modifiedOn: (s as any).modified_on,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        etag: (s as any).etag,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        compatibilityDate: settings?.compatibility_date || (s as any).compatibility_date,
        bindings,
      }
    } catch {
      /* ignore */
    }

    return { worker: summary, content }
  }

  async deployWorker(params: {
    scriptName: string
    code: string
    compatibilityDate?: string
    bindings?: WorkerBinding[]
  }): Promise<{ ok: boolean; scriptName: string; modifiedOn?: string }> {
    const { scriptName, code, compatibilityDate, bindings } = params
    if (!scriptName) throw new Error('scriptName is required')
    if (!code) throw new Error('code is required')

    const mainModuleName = 'index.js'
    const metadataBindings = (bindings ?? []).map((b) => {
      if (b.type === 'kv_namespace' && b.targetId) {
        return { type: 'kv_namespace', name: b.name, namespace_id: b.targetId }
      }
      if (b.type === 'r2_bucket' && b.targetId) {
        return { type: 'r2_bucket', name: b.name, bucket_name: b.targetId }
      }
      if (b.type === 'd1' && b.targetId) {
        return { type: 'd1', name: b.name, database_id: b.targetId }
      }
      if (b.type === 'plain_text' && b.targetId) {
        return { type: 'plain_text', name: b.name, text: b.targetId }
      }
      if (b.type === 'secret_text' && b.targetId) {
        return { type: 'secret_text', name: b.name, text: b.targetId }
      }
      return b.details || { type: b.type, name: b.name }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadata: any = {
      main_module: mainModuleName,
      compatibility_date: compatibilityDate || '2024-09-23',
    }
    if (metadataBindings.length > 0) {
      metadata.bindings = metadataBindings
    }

    const file = new File([code], mainModuleName, { type: 'application/javascript+module' })
    const res = await this.client.workers.scripts.update(scriptName, {
      account_id: this.cfg.accountId,
      metadata,
      files: [file],
    })

    return {
      ok: true,
      scriptName,
      modifiedOn: res.modified_on,
    }
  }

  /* ---- v0.3: KV Browser (Read-only) -------------------------------- */

  async listKvNamespaces(): Promise<KVNamespaceInfo[]> {
    const out: KVNamespaceInfo[] = []
    for await (const ns of this.client.kv.namespaces.list({
      account_id: this.cfg.accountId,
    })) {
      if (ns.id && ns.title) {
        out.push({
          id: ns.id,
          title: ns.title,
          supportsUrlEncoding: ns.supports_url_encoding,
        })
      }
    }
    return out
  }

  async listKvKeys(
    namespaceId: string,
    params?: { prefix?: string; cursor?: string; limit?: number }
  ): Promise<{ keys: KVKeyInfo[]; cursor?: string }> {
    const res = await this.client.kv.namespaces.keys.list(namespaceId, {
      account_id: this.cfg.accountId,
      prefix: params?.prefix,
      cursor: params?.cursor,
      limit: params?.limit || 100,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keys: KVKeyInfo[] = (res.result || []).map((k: any) => ({
      name: k.name,
      expiration: k.expiration,
      metadata: k.metadata,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cursor = (res as any).result_info?.cursor || undefined
    return { keys, cursor }
  }

  async getKvValue(
    namespaceId: string,
    key: string
  ): Promise<{ value: string | null; isJson?: boolean; metadata?: unknown }> {
    try {
      const resp = await this.client.kv.namespaces.values.get(key, {
        account_id: this.cfg.accountId,
        namespace_id: namespaceId,
      })
      const text = await resp.text()
      let isJson = false
      try {
        JSON.parse(text)
        isJson = true
      } catch {
        isJson = false
      }
      return { value: text, isJson }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err?.status === 404) return { value: null }
      throw err
    }
  }

  /* ---- v0.3: R2 Browser (Read-only) -------------------------------- */

  async listR2Buckets(): Promise<R2BucketInfo[]> {
    const out: R2BucketInfo[] = []
    const res = await this.client.r2.buckets.list({
      account_id: this.cfg.accountId,
    })
    for (const b of res.buckets || []) {
      if (b.name) {
        out.push({
          name: b.name,
          creationDate: b.creation_date,
          location: b.location,
        })
      }
    }
    return out
  }

  async listR2Objects(
    bucketName: string,
    params?: { prefix?: string; cursor?: string; delimiter?: string; limit?: number }
  ): Promise<{ objects: R2ObjectInfo[]; delimitedPrefixes?: string[]; cursor?: string }> {
    const objects: R2ObjectInfo[] = []
    let count = 0
    const max = params?.limit || 100

    for await (const o of this.client.r2.buckets.objects.list(bucketName, {
      account_id: this.cfg.accountId,
      prefix: params?.prefix,
      cursor: params?.cursor,
      delimiter: params?.delimiter,
      per_page: max,
    })) {
      if (o.key) {
        objects.push({
          key: o.key,
          size: o.size || 0,
          uploaded: o.last_modified || '',
          etag: o.etag,
          httpMetadata: o.http_metadata as unknown as Record<string, string>,
          customMetadata: o.custom_metadata,
        })
      }
      count++
      if (count >= max) break
    }

    return { objects }
  }

  /* ---- v0.3: D1 Browser (Read-only) -------------------------------- */

  async listD1Databases(): Promise<D1DatabaseInfo[]> {
    const out: D1DatabaseInfo[] = []
    for await (const db of this.client.d1.database.list({
      account_id: this.cfg.accountId,
    })) {
      if (db.uuid && db.name) {
        out.push({
          uuid: db.uuid,
          name: db.name,
          version: db.version,
          createdAt: db.created_at,
        })
      }
    }
    return out
  }

  async getD1Tables(databaseId: string): Promise<D1TableInfo[]> {
    try {
      const res = await this.queryD1ReadOnly(
        databaseId,
        "SELECT name, sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;"
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return res.rows.map((r: any) => ({
        name: String(r.name || ''),
        schema: String(r.sql || ''),
      }))
    } catch {
      return []
    }
  }

  async queryD1ReadOnly(databaseId: string, sql: string, params?: unknown[]): Promise<D1QueryResult> {
    const validation = this.validateReadOnlySql(sql)
    if (!validation.ok) {
      return {
        columns: [],
        rows: [],
        error: validation.reason || 'Query not permitted in read-only browser',
      }
    }

    try {
      const stringParams = params ? params.map((p) => String(p)) : undefined
      const res = await this.client.d1.database.query(databaseId, {
        account_id: this.cfg.accountId,
        sql,
        params: stringParams,
      })

      const first = Array.isArray(res) ? res[0] : res
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = (first as any)?.results || []
      const columns = results.length > 0 ? Object.keys(results[0]) : []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = (first as any)?.meta

      return {
        columns,
        rows: results,
        durationMs: meta?.duration,
        changes: meta?.changes,
      }
    } catch (err) {
      return {
        columns: [],
        rows: [],
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private validateReadOnlySql(sql: string): { ok: boolean; reason?: string } {
    const clean = sql.trim().replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '').trim()
    if (!clean) return { ok: false, reason: 'Empty SQL query' }

    const forbiddenPatterns = [
      /\b(insert|update|delete|drop|alter|create|replace|truncate|vacuum|attach|detach|reindex)\b/i,
      /\b(grant|revoke|commit|rollback|savepoint|release)\b/i,
    ]

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(clean)) {
        return {
          ok: false,
          reason: 'Mutation/DDL query rejected. D1 browser is strictly read-only (SELECT / PRAGMA only).',
        }
      }
    }

    if (!/^(select|pragma|explain|with)\b/i.test(clean)) {
      return {
        ok: false,
        reason: 'Only SELECT, PRAGMA, and EXPLAIN queries are permitted.',
      }
    }

    return { ok: true }
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
