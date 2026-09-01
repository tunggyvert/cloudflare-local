import type {
  Orphan,
  Plan,
  ApplyResult,
  Resource,
  Service,
  QuickTunnel,
  WorkerSummary,
  WorkerBinding,
  WorkerTailEvent,
  KVNamespaceInfo,
  KVKeyInfo,
  R2BucketInfo,
  R2ObjectInfo,
  D1DatabaseInfo,
  D1TableInfo,
  D1QueryResult,
  ExplorerTrace,
  NginxServerBlock,
  NginxUpstream,
} from './model'

export interface CoreRequests {
  'health': { req: void; res: { ok: true; version: string } }
  /** Re-read live state from every enabled provider. */
  'discover': { req: { providers?: string[] }; res: { resources: Resource[] } }
  /** Discovered resources assembled into user-facing services. */
  'services': { req: void; res: { services: Service[] } }
  /** Find resources nothing references any more. */
  'orphans': { req: void; res: { orphans: Orphan[] } }
  /** Compute a diff. Never mutates. */
  'plan': { req: { desired: unknown }; res: { plan: Plan } }
  /** Apply approved changes from a previously-computed plan. */
  'apply': { req: { planId: string; changeIds: string[] }; res: { results: ApplyResult[] } }
  /** Start/stop a supervised cloudflared process. */
  'tunnel.run': { req: { tunnelId: string }; res: { pid: number } }
  'tunnel.stop': { req: { tunnelId: string }; res: { stopped: boolean } }

  /** Start an ad-hoc TryCloudflare quick tunnel for a local URL/port. */
  'quickTunnel.start': {
    req: { targetUrl: string; id?: string }
    res: { tunnel: QuickTunnel }
  }
  /** Stop a running TryCloudflare quick tunnel. */
  'quickTunnel.stop': {
    req: { id: string }
    res: { stopped: boolean }
  }
  /** List active and recent TryCloudflare quick tunnels. */
  'quickTunnel.list': {
    req: void
    res: { tunnels: QuickTunnel[] }
  }

  /** List available Cloudflare DNS zones. */
  'zones.list': {
    req: void
    res: { zones: Array<{ id: string; name: string }> }
  }
  /** Expose a container at a real hostname via Cloudflare Tunnel ingress & DNS CNAME. */
  'container.expose': {
    req: { tunnelId: string; hostname: string; service: string; path?: string; zoneId?: string }
    res: { ok: boolean; ingressAdded: boolean; dnsCreated: boolean; hostname: string }
  }
  /** Save a Cloudflare API token + account ID to the OS keychain. */
  'account.save': {
    req: { accountId: string; apiToken: string; label?: string }
    res: { ok: boolean; error?: string }
  }
  /** Check whether a Cloudflare account is configured and reachable. */
  'account.status': {
    req: void
    res: { configured: boolean; accountId?: string; label?: string; reachable?: boolean; detail?: string }
  }
  /** Remove saved Cloudflare credentials. */
  'account.remove': {
    req: void
    res: { ok: boolean }
  }
  /** Validate a token by calling the Cloudflare API (before saving). */
  'account.validate': {
    req: { accountId: string; apiToken: string }
    res: { ok: boolean; detail?: string }
  }
  /** Execute approved orphan cleanup changes. Separate from `apply` to respect the plan gate. */
  'orphan.cleanup': {
    req: { changeIds: string[] }
    res: { results: ApplyResult[] }
  }

  /* ---- v0.3: Workers & Tail ----------------------------------------- */

  /** List deployed Worker scripts. */
  'workers.list': {
    req: void
    res: { workers: WorkerSummary[] }
  }
  /** Get details and script bindings of a single Worker. */
  'workers.get': {
    req: { scriptName: string }
    res: { worker: WorkerSummary; content?: string }
  }
  /** Deploy or update a Worker script. */
  'workers.deploy': {
    req: {
      scriptName: string
      code: string
      compatibilityDate?: string
      bindings?: WorkerBinding[]
    }
    res: { ok: boolean; scriptName: string; modifiedOn?: string }
  }
  /** Start a real-time log tail session on a Worker. */
  'worker.tail.start': {
    req: { scriptName: string; filter?: { status?: string; search?: string } }
    res: { ok: boolean; tailId: string; url?: string }
  }
  /** Stop an active Worker log tail session. */
  'worker.tail.stop': {
    req: { scriptName: string; tailId?: string }
    res: { stopped: boolean }
  }

  /* ---- v0.3: Storage & Bindings (Read-only) --------------------------- */

  /** List KV namespaces in the account. */
  'kv.namespaces.list': {
    req: void
    res: { namespaces: KVNamespaceInfo[] }
  }
  /** List keys in a KV namespace. */
  'kv.keys.list': {
    req: { namespaceId: string; prefix?: string; cursor?: string; limit?: number }
    res: { keys: KVKeyInfo[]; cursor?: string }
  }
  /** Get a KV value and its metadata (Read-only). */
  'kv.value.get': {
    req: { namespaceId: string; key: string }
    res: { value: string | null; isJson?: boolean; metadata?: unknown }
  }

  /** List R2 buckets in the account. */
  'r2.buckets.list': {
    req: void
    res: { buckets: R2BucketInfo[] }
  }
  /** List objects in an R2 bucket (Read-only). */
  'r2.objects.list': {
    req: { bucketName: string; prefix?: string; cursor?: string; delimiter?: string; limit?: number }
    res: { objects: R2ObjectInfo[]; delimitedPrefixes?: string[]; cursor?: string }
  }

  /** List D1 databases in the account. */
  'd1.databases.list': {
    req: void
    res: { databases: D1DatabaseInfo[] }
  }
  /** List tables and schema in a D1 database. */
  'd1.tables.list': {
    req: { databaseId: string }
    res: { tables: D1TableInfo[] }
  }
  /** Execute a read-only query (SELECT/PRAGMA only) against a D1 database. */
  'd1.query.select': {
    req: { databaseId: string; sql: string; params?: unknown[] }
    res: D1QueryResult
  }

  /* ---- v0.3: Local Explorer & Wrangler Dev --------------------------- */

  /** Check status of Local Explorer trace collector. */
  'explorer.status': {
    req: void
    res: { running: boolean; port: number; traceCount: number; wranglerDevRunning: boolean; wranglerProject?: string }
  }
  /** List captured local traces. */
  'explorer.traces.list': {
    req: { limit?: number; scriptName?: string }
    res: { traces: ExplorerTrace[] }
  }
  /** Clear captured traces. */
  'explorer.traces.clear': {
    req: void
    res: { ok: boolean }
  }
  /** Start/stop local Explorer HTTP receiver. */
  'explorer.server.toggle': {
    req: { enabled: boolean; port?: number }
    res: { running: boolean; port: number }
  }
  /** Start a supervised `wrangler dev` process in a directory. */
  'explorer.wrangler.start': {
    req: { projectPath: string; port?: number; inspectorPort?: number }
    res: { ok: boolean; pid?: number; port?: number; inspectorPort?: number }
  }
  /** Stop the running `wrangler dev` process. */
  'explorer.wrangler.stop': {
    req: void
    res: { stopped: boolean }
  }

  /* ---- v0.3: Nginx Adapter ------------------------------------------- */

  /** Get Nginx adapter status, detected config paths, and watched files. */
  'nginx.status': {
    req: void
    res: {
      available: boolean
      configPath?: string
      watchedFiles: string[]
      serversCount: number
      error?: string
    }
  }
  /** Set a custom Nginx configuration file path. */
  'nginx.config.setPath': {
    req: { configPath: string }
    res: { ok: boolean; configPath: string; serversCount: number; error?: string }
  }
  /** List parsed Nginx server blocks and upstreams. */
  'nginx.servers.list': {
    req: void
    res: { servers: NginxServerBlock[]; upstreams: NginxUpstream[] }
  }
}

export type CoreMethod = keyof CoreRequests

export interface CoreEvents {
  /** Streamed stdout/stderr from a supervised process. */
  'log': { source: string; stream: 'stdout' | 'stderr'; line: string; at: string }
  /** A supervised process changed state. */
  'process': { source: string; state: 'starting' | 'running' | 'stopped' | 'crashed'; detail?: string }
  /** Background discovery finished. */
  'discovered': { count: number; at: string }
  /** Quick tunnel status or public URL updated. */
  'quickTunnel': { tunnel: QuickTunnel }
  /** Real-time Docker container lifecycle event. */
  'container': {
    action: 'start' | 'stop' | 'die' | 'destroy' | 'create' | 'rename' | string
    containerId: string
    name?: string
    image?: string
    at: string
  }
  /** Real-time Worker tail log event. */
  'workerTail': { scriptName: string; event: WorkerTailEvent }
  /** Real-time local explorer trace event. */
  'explorerTrace': { trace: ExplorerTrace }
  /** Nginx configuration file changed or reloaded. */
  'nginx': { event: 'change' | 'error' | 'reload'; path?: string; detail?: string }
}


export type CoreEventName = keyof CoreEvents

/* ---- envelope ---- */

export interface RpcRequest<M extends CoreMethod = CoreMethod> {
  kind: 'request'
  id: string
  method: M
  params: CoreRequests[M]['req']
}

export interface RpcResponse<M extends CoreMethod = CoreMethod> {
  kind: 'response'
  id: string
  ok: boolean
  result?: CoreRequests[M]['res']
  error?: { message: string; code?: string }
}

export interface RpcEvent<E extends CoreEventName = CoreEventName> {
  kind: 'event'
  event: E
  payload: CoreEvents[E]
}

export type CoreMessage = RpcRequest | RpcResponse | RpcEvent

/** Channel names used on the Electron IPC bridge. */
export const IPC_INVOKE = 'core:invoke'
export const IPC_EVENT = 'core:event'
