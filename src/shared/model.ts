export type ProviderId = 'cloudflare' | 'docker' | 'nginx'

/**
 * A user-facing unit of deployment. Not a provider concept — a Service is the
 * thing a person actually names, e.g. "api.tung.dev". It is assembled from
 * resources contributed by several providers.
 */
export interface Service {
  id: string
  name: string
  hostname?: string
  routes: Route[]
  origins: Origin[]
  /** Resource ids this service is composed of, for drill-down. */
  members: string[]
}

/** An inbound path into a service: a hostname/path pattern that reaches an origin. */
export interface Route {
  id: string
  provider: ProviderId
  hostname: string
  path?: string
  /** Origin id this route forwards to, when known. */
  originId?: string
  /** e.g. 'tunnel-ingress', 'dns-record', 'nginx-server-block' */
  kind: string
}

/** Something that can actually serve a request: a container, a local port, an upstream. */
export interface Origin {
  id: string
  provider: ProviderId
  /** Human label — container name, upstream name. */
  name: string
  /** e.g. 'http://localhost:8080', 'http://web:3000' */
  address: string
  state: 'running' | 'stopped' | 'unknown'
  /** Free-form provider detail for the detail pane. Never used for logic. */
  meta?: Record<string, string>
}

/** Any discovered thing, before it has been assembled into Services. */
export interface Resource {
  id: string
  provider: ProviderId
  /** Provider-native type, e.g. 'tunnel', 'dns_record', 'container'. */
  type: string
  name: string
  /** Present when this resource is (or contains) a route. */
  routes?: Route[]
  /** Present when this resource can serve traffic. */
  origins?: Origin[]
  meta?: Record<string, string>
}

export type ChangeAction = 'create' | 'update' | 'delete'

/**
 * A single proposed mutation. Nothing in this app writes to a provider without
 * first producing one of these and having a human approve it.
 */
export interface Change {
  id: string
  provider: ProviderId
  action: ChangeAction
  /** Provider-native type being changed. */
  resourceType: string
  resourceName: string
  /** Human-readable one-liner shown in the diff list. */
  summary: string
  /** Field-level before/after, for the expanded diff view. */
  fields: ChangeField[]
  /**
   * True when applying this cannot be undone by applying its inverse
   * (e.g. deleting a tunnel loses its credentials). Surfaced prominently.
   */
  destructive: boolean
}

export interface ChangeField {
  path: string
  before: string | null
  after: string | null
}

export interface Plan {
  id: string
  createdAt: string
  changes: Change[]
}

export interface ApplyResult {
  changeId: string
  ok: boolean
  error?: string
}

/** A change rendered as infrastructure-as-code, for the export path. */
export interface IaCFragment {
  format: 'terraform' | 'alchemy'
  filename: string
  content: string
}
/**
 * A resource that exists in a provider but nothing references any more:
 * a tunnel with no running cloudflared, a DNS record pointing at a dead
 * tunnel, an ingress rule whose container is gone.
 *
 * Every competing tool leaks these. Finding and cleaning them is the reason
 * this app exists.
 */
export interface Orphan {
  resource: Resource
  /** Why we believe it is orphaned, in plain language. */
  reason: string
  /** How confident the detector is. Only 'certain' is offered for bulk cleanup. */
  confidence: 'certain' | 'likely'
  /** The change that would remove it. */
  cleanup: Change
}

/**
 * An ephemeral Cloudflare Quick Tunnel (TryCloudflare) running locally without
 * an account, exposing a local origin URL to a generated trycloudflare.com domain.
 */
export interface QuickTunnel {
  id: string
  targetUrl: string
  publicUrl?: string
  status: 'starting' | 'running' | 'stopped' | 'crashed'
  createdAt: string
  error?: string
}

/* =========================================================================
 * v0.3 Models: Workers, Bindings (KV/R2/D1), Local Explorer, Nginx
 * ========================================================================= */

export interface WorkerBinding {
  type: 'kv_namespace' | 'r2_bucket' | 'd1' | 'secret_text' | 'plain_text' | 'service' | 'queue' | string
  name: string
  targetId?: string
  details?: Record<string, unknown>
}

export interface WorkerSummary {
  id: string
  name: string
  createdOn?: string
  modifiedOn?: string
  etag?: string
  routes?: string[]
  domains?: string[]
  bindings?: WorkerBinding[]
  compatibilityDate?: string
  logpush?: boolean
}

export interface WorkerTailEvent {
  id: string
  scriptName: string
  eventTimestamp: string
  outcome: 'ok' | 'exception' | 'exceededCpu' | 'canceled' | 'unknown'
  request?: {
    method: string
    url: string
    headers?: Record<string, string>
    cf?: Record<string, unknown>
  }
  response?: {
    status: number
  }
  logs: Array<{
    level: 'log' | 'warn' | 'error' | 'debug' | 'info'
    message: string[]
    timestamp: number
  }>
  exceptions: Array<{
    name: string
    message: string
    timestamp: number
  }>
  executionTimeMs?: number
}

export interface KVNamespaceInfo {
  id: string
  title: string
  supportsUrlEncoding?: boolean
}

export interface KVKeyInfo {
  name: string
  expiration?: number
  metadata?: unknown
}

export interface R2BucketInfo {
  name: string
  creationDate?: string
  location?: string
}

export interface R2ObjectInfo {
  key: string
  size: number
  uploaded: string
  etag?: string
  httpMetadata?: Record<string, string>
  customMetadata?: Record<string, string>
}

export interface D1DatabaseInfo {
  uuid: string
  name: string
  version?: string
  numTables?: number
  fileSize?: number
  createdAt?: string
}

export interface D1TableInfo {
  name: string
  schema?: string
  rowCount?: number
}

export interface D1QueryResult {
  columns: string[]
  rows: Array<Record<string, unknown>>
  durationMs?: number
  changes?: number
  error?: string
}

export interface ExplorerTrace {
  id: string
  timestamp: string
  source: 'wrangler' | 'worker' | 'tunnel' | 'nginx' | 'custom'
  scriptName?: string
  method: string
  url: string
  status?: number
  durationMs?: number
  clientIp?: string
  userAgent?: string
  headers?: Record<string, string>
  logs?: Array<{ level: string; message: string; timestamp: string }>
  exceptions?: Array<{ message: string; stack?: string }>
  hops?: Array<{ name: string; status?: string; durationMs?: number }>
}

export interface NginxServerBlock {
  serverName: string
  listen: string[]
  locations: Array<{
    path: string
    proxyPass?: string
    root?: string
    alias?: string
    returns?: string
  }>
  sourceFile: string
  line: number
}

export interface NginxUpstream {
  name: string
  servers: string[]
  sourceFile: string
}

