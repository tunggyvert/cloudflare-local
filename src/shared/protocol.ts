import type { Orphan, Plan, ApplyResult, Resource, Service } from './model'

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
}

export type CoreMethod = keyof CoreRequests

export interface CoreEvents {
  /** Streamed stdout/stderr from a supervised process. */
  'log': { source: string; stream: 'stdout' | 'stderr'; line: string; at: string }
  /** A supervised process changed state. */
  'process': { source: string; state: 'starting' | 'running' | 'stopped' | 'crashed'; detail?: string }
  /** Background discovery finished. */
  'discovered': { count: number; at: string }
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
