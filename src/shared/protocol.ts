import type { Orphan, Plan, ApplyResult, Resource, Service, QuickTunnel } from './model'

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
