/**
 * The core service.
 *
 * This file must never import from 'electron'. It runs today as a child process
 * forked by the Electron main process, and is designed to be promoted to an
 * OS-level daemon (launchd / systemd / Windows Service) without changing any
 * logic — only how it is started and how messages reach it.
 *
 * Guard this rule in review: one `import { app } from 'electron'` here and the
 * daemon path is gone.
 */
import { DockerProvider } from './providers/docker'
import { CloudflareProvider } from './providers/cloudflare'
import { NginxProvider } from './providers/nginx'
import { detectOrphans } from './orphans'
import { Supervisor } from './supervisor/process'
import { QuickTunnelManager } from './quick-tunnel'
import { LocalCacheStore } from './cache/store'
import { WorkerTailManager } from './workers/tail'
import { LocalExplorerManager } from './explorer/manager'
import { readToken, saveToken, deleteToken } from './secrets'
import type { Provider } from './providers/types'
import type { Resource, Service } from '../shared/model'
import type { CoreMessage, RpcRequest, RpcResponse, RpcEvent } from '../shared/protocol'

const VERSION = '0.3.0'

const supervisor = new Supervisor()
const quickTunnels = new QuickTunnelManager(supervisor)
const docker = new DockerProvider()
const nginx = new NginxProvider()
const cache = new LocalCacheStore()
let cloudflare: CloudflareProvider | null = null
let accountMeta: { accountId: string; label: string } | null = null

const workerTails = new WorkerTailManager(
  () => cloudflare?.getClient() ?? null,
  () => cloudflare?.getAccountId() ?? null
)
const explorer = new LocalExplorerManager(supervisor)

/** Build the active provider list dynamically based on what's configured. */
function activeProviders(): Provider[] {
  return cloudflare ? [docker, nginx, cloudflare] : [docker, nginx]
}

/**
 * Try to restore Cloudflare credentials from the OS keychain on startup.
 * Account metadata (accountId + label) is stored as a JSON string under a
 * well-known keyring key so we can look up the real token on next launch.
 */
function restoreAccount(): void {
  const metaRaw = readToken('__account_meta__')
  if (!metaRaw) return
  try {
    const meta = JSON.parse(metaRaw) as { accountId: string; label: string }
    const token = readToken(meta.accountId)
    if (!token) return
    cloudflare = new CloudflareProvider({ apiToken: token, accountId: meta.accountId })
    accountMeta = meta
  } catch {
    /* corrupt meta — user must re-onboard */
  }
}

// Initial state loaded from SQLite cache for instant startup
let lastDiscovery: Resource[] = cache.loadResources()

/* ---- transport ---------------------------------------------------- */

function send(msg: CoreMessage): void {
  process.send?.(msg)
}

function emit<E extends RpcEvent['event']>(event: E, payload: unknown): void {
  send({ kind: 'event', event, payload } as RpcEvent)
}

supervisor.on('log', (e) => emit('log', e))
supervisor.on('state', (e) => emit('process', e))
quickTunnels.on('update', (tunnel) => emit('quickTunnel', { tunnel }))
docker.on('container', (e) => {
  emit('container', e)
  // Automatically refresh discovery in background when container lifecycle changes
  void runDiscovery()
})
nginx.on('change', (e) => {
  emit('nginx', e)
  void runDiscovery()
})
nginx.on('error', (e) => emit('nginx', e))
workerTails.on('tail', (e) => emit('workerTail', e))
workerTails.on('error', (e) => {
  emit('log', {
    source: `worker:${e.scriptName}`,
    stream: 'stderr',
    line: e.error,
    at: new Date().toISOString(),
  })
})
explorer.on('trace', (trace) => emit('explorerTrace', { trace }))

/** Core discovery runner */
async function runDiscovery(): Promise<Resource[]> {
  const providerList = activeProviders()
  const results = await Promise.allSettled(providerList.map((p) => p.discover()))
  lastDiscovery = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))

  for (const [i, r] of results.entries()) {
    if (r.status === 'rejected') {
      emit('process', {
        source: providerList[i].id,
        state: 'crashed',
        detail: `discover failed: ${r.reason}`,
      })
    }
  }

  // Persist latest state to SQLite cache
  cache.saveResources(lastDiscovery)

  emit('discovered', { count: lastDiscovery.length, at: new Date().toISOString() })
  return lastDiscovery
}

/* ---- request handling --------------------------------------------- */

async function handle(req: RpcRequest): Promise<unknown> {
  switch (req.method) {
    case 'health':
      return { ok: true, version: VERSION }

    case 'discover': {
      const resources = await runDiscovery()
      return { resources }
    }

    case 'services':
      return { services: assemble(lastDiscovery) }

    case 'orphans':
      return { orphans: detectOrphans(lastDiscovery) }

    case 'plan':
      // v0.5. Returning an empty plan is correct-but-useless; it is never a lie.
      return { plan: { id: `plan_${Date.now()}`, createdAt: new Date().toISOString(), changes: [] } }

    case 'apply':
      throw new Error('apply is not implemented until v0.5 — the plan gate must land first')

    case 'tunnel.run': {
      const { tunnelId } = req.params as { tunnelId: string }
      const proc = supervisor.spawn({
        id: `cloudflared:${tunnelId}`,
        command: 'cloudflared',
        args: ['tunnel', 'run', tunnelId],
        restart: true,
      })
      return { pid: proc.pid ?? -1 }
    }

    case 'tunnel.stop': {
      const { tunnelId } = req.params as { tunnelId: string }
      return { stopped: await supervisor.stop(`cloudflared:${tunnelId}`) }
    }

    /* ---- quick tunnels (trycloudflare) ------------------------------ */

    case 'quickTunnel.start': {
      const { targetUrl, id } = req.params as { targetUrl: string; id?: string }
      const tunnel = quickTunnels.start(targetUrl, id)
      return { tunnel }
    }

    case 'quickTunnel.stop': {
      const { id } = req.params as { id: string }
      const stopped = await quickTunnels.stop(id)
      return { stopped }
    }

    case 'quickTunnel.list':
      return { tunnels: quickTunnels.list() }


    /* ---- account management ----------------------------------------- */

    case 'account.validate': {
      const { accountId, apiToken } = req.params as { accountId: string; apiToken: string }
      const temp = new CloudflareProvider({ apiToken, accountId })
      const result = await temp.available()
      return { ok: result.ok, detail: result.detail }
    }

    case 'account.save': {
      const { accountId, apiToken, label } = req.params as {
        accountId: string; apiToken: string; label?: string
      }
      try {
        saveToken(accountId, apiToken)
        const meta = { accountId, label: label ?? accountId }
        // Store account metadata so we can restore on next launch
        saveToken('__account_meta__', JSON.stringify(meta))
        cloudflare = new CloudflareProvider({ apiToken, accountId })
        accountMeta = meta
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }

    case 'account.status': {
      if (!cloudflare || !accountMeta) {
        return { configured: false }
      }
      try {
        const avail = await cloudflare.available()
        return {
          configured: true,
          accountId: accountMeta.accountId,
          label: accountMeta.label,
          reachable: avail.ok,
          detail: avail.detail,
        }
      } catch {
        return {
          configured: true,
          accountId: accountMeta.accountId,
          label: accountMeta.label,
          reachable: false,
          detail: 'failed to check reachability',
        }
      }
    }

    case 'account.remove': {
      if (accountMeta) {
        deleteToken(accountMeta.accountId)
        deleteToken('__account_meta__')
      }
      cloudflare = null
      accountMeta = null
      cache.clear()
      lastDiscovery = lastDiscovery.filter((r) => r.provider !== 'cloudflare')
      cache.saveResources(lastDiscovery)
      return { ok: true }
    }

    /* ---- orphan cleanup --------------------------------------------- */

    case 'orphan.cleanup': {
      // This is the ONLY write path in v0.1 — orphan cleanup deletes.
      // It bypasses the general `apply` gate but still requires each change
      // to have been generated by the orphan detector.
      const { changeIds } = req.params as { changeIds: string[] }
      if (!cloudflare) throw new Error('No Cloudflare account configured')

      const orphans = detectOrphans(lastDiscovery)
      const validChanges = orphans
        .filter((o) => changeIds.includes(o.cleanup.id))
        .map((o) => o.cleanup)

      if (validChanges.length !== changeIds.length) {
        throw new Error(
          `${changeIds.length - validChanges.length} change(s) are not valid orphan cleanup operations`,
        )
      }

      const results = await Promise.all(
        validChanges.map((change) => cloudflare!.apply(change)),
      )
      return { results }
    }

    /* ---- zones & container expose ----------------------------------- */

    case 'zones.list': {
      if (!cloudflare) return { zones: [] }
      const zones = await cloudflare.listZones()
      return { zones }
    }

    case 'container.expose': {
      if (!cloudflare) {
        throw new Error('No Cloudflare account configured. Please connect your account first.')
      }
      const params = req.params as {
        tunnelId: string
        hostname: string
        service: string
        path?: string
        zoneId?: string
      }
      const result = await cloudflare.exposeHostname(params)
      // Trigger background discovery update so the UI immediately receives new state
      void runDiscovery()
      return result
    }

    /* ---- v0.3: Workers & Tail ----------------------------------------- */

    case 'workers.list': {
      const workers = cloudflare ? await cloudflare.listWorkers() : []
      return { workers }
    }

    case 'workers.get': {
      if (!cloudflare) throw new Error('No Cloudflare account configured')
      const { scriptName } = req.params as { scriptName: string }
      return await cloudflare.getWorker(scriptName)
    }

    case 'workers.deploy': {
      if (!cloudflare) throw new Error('No Cloudflare account configured')
      const params = req.params as {
        scriptName: string
        code: string
        compatibilityDate?: string
        bindings?: import('../shared/model').WorkerBinding[]
      }
      const result = await cloudflare.deployWorker(params)
      void runDiscovery()
      return result
    }

    case 'worker.tail.start': {
      const { scriptName, filter } = req.params as {
        scriptName: string
        filter?: { status?: string; search?: string }
      }
      return await workerTails.startTail(scriptName, filter)
    }

    case 'worker.tail.stop': {
      const { scriptName } = req.params as { scriptName: string; tailId?: string }
      const stopped = await workerTails.stopTail(scriptName)
      return { stopped }
    }

    /* ---- v0.3: Storage & Bindings (Read-only) ------------------------- */

    case 'kv.namespaces.list': {
      const namespaces = cloudflare ? await cloudflare.listKvNamespaces() : []
      return { namespaces }
    }

    case 'kv.keys.list': {
      if (!cloudflare) throw new Error('No Cloudflare account configured')
      const { namespaceId, prefix, cursor, limit } = req.params as {
        namespaceId: string
        prefix?: string
        cursor?: string
        limit?: number
      }
      return await cloudflare.listKvKeys(namespaceId, { prefix, cursor, limit })
    }

    case 'kv.value.get': {
      if (!cloudflare) throw new Error('No Cloudflare account configured')
      const { namespaceId, key } = req.params as { namespaceId: string; key: string }
      return await cloudflare.getKvValue(namespaceId, key)
    }

    case 'r2.buckets.list': {
      const buckets = cloudflare ? await cloudflare.listR2Buckets() : []
      return { buckets }
    }

    case 'r2.objects.list': {
      if (!cloudflare) throw new Error('No Cloudflare account configured')
      const { bucketName, prefix, cursor, delimiter, limit } = req.params as {
        bucketName: string
        prefix?: string
        cursor?: string
        delimiter?: string
        limit?: number
      }
      return await cloudflare.listR2Objects(bucketName, { prefix, cursor, delimiter, limit })
    }

    case 'd1.databases.list': {
      const databases = cloudflare ? await cloudflare.listD1Databases() : []
      return { databases }
    }

    case 'd1.tables.list': {
      if (!cloudflare) throw new Error('No Cloudflare account configured')
      const { databaseId } = req.params as { databaseId: string }
      const tables = await cloudflare.getD1Tables(databaseId)
      return { tables }
    }

    case 'd1.query.select': {
      if (!cloudflare) throw new Error('No Cloudflare account configured')
      const { databaseId, sql, params } = req.params as {
        databaseId: string
        sql: string
        params?: unknown[]
      }
      return await cloudflare.queryD1ReadOnly(databaseId, sql, params)
    }

    /* ---- v0.3: Local Explorer & Wrangler Dev ------------------------- */

    case 'explorer.status':
      return explorer.getStatus()

    case 'explorer.traces.list': {
      const { limit, scriptName } = (req.params as { limit?: number; scriptName?: string } | undefined) ?? {}
      return { traces: explorer.getTraces(limit, scriptName) }
    }

    case 'explorer.traces.clear':
      explorer.clearTraces()
      return { ok: true }

    case 'explorer.server.toggle': {
      const { enabled, port } = req.params as { enabled: boolean; port?: number }
      if (enabled) {
        return await explorer.startServer(port)
      }
      return await explorer.stopServer()
    }

    case 'explorer.wrangler.start': {
      const { projectPath, port, inspectorPort } = req.params as {
        projectPath: string
        port?: number
        inspectorPort?: number
      }
      return await explorer.startWrangler(projectPath, port, inspectorPort)
    }

    case 'explorer.wrangler.stop': {
      const stopped = await explorer.stopWrangler()
      return { stopped }
    }

    /* ---- v0.3: Nginx Adapter ----------------------------------------- */

    case 'nginx.status': {
      const avail = await nginx.available()
      return {
        available: avail.ok,
        configPath: nginx.getConfigPath(),
        watchedFiles: nginx.getWatchedFiles(),
        serversCount: nginx.getServers().length,
        error: avail.detail,
      }
    }

    case 'nginx.config.setPath': {
      const { configPath } = req.params as { configPath: string }
      const setRes = nginx.setConfigPath(configPath)
      if (setRes.ok) {
        void runDiscovery()
      }
      return {
        ok: setRes.ok,
        configPath: setRes.path,
        serversCount: nginx.getServers().length,
        error: setRes.error,
      }
    }

    case 'nginx.servers.list':
      return {
        servers: nginx.getServers(),
        upstreams: nginx.getUpstreams(),
      }

    default:
      throw new Error(`unknown method: ${String(req.method)}`)
  }
}

/**
 * Assemble provider resources into user-facing Services.
 *
 * This is the "organise by service, not by provider" idea made concrete: a
 * hostname is the identity, and every provider that touches that hostname
 * contributes to one Service the user recognises.
 */
function assemble(resources: Resource[]): Service[] {
  const byHostname = new Map<string, Service>()

  for (const r of resources) {
    for (const route of r.routes ?? []) {
      const existing = byHostname.get(route.hostname)
      if (existing) {
        existing.routes.push(route)
        existing.members.push(r.id)
        continue
      }
      byHostname.set(route.hostname, {
        id: `service:${route.hostname}`,
        name: route.hostname,
        hostname: route.hostname,
        routes: [route],
        origins: [],
        members: [r.id],
      })
    }
  }

  // Attach origins by address match.
  const origins = resources.flatMap((r) => r.origins ?? [])
  for (const svc of byHostname.values()) {
    svc.origins = origins.filter((o) =>
      svc.routes.some((rt) => rt.originId === o.id || rt.originId === o.address),
    )
  }

  return [...byHostname.values()]
}

/* ---- wiring -------------------------------------------------------- */

process.on('message', async (msg: CoreMessage) => {
  if (msg.kind !== 'request') return
  const req = msg as RpcRequest

  try {
    const result = await handle(req)
    send({ kind: 'response', id: req.id, ok: true, result } as RpcResponse)
  } catch (err) {
    send({
      kind: 'response',
      id: req.id,
      ok: false,
      error: { message: err instanceof Error ? err.message : String(err) },
    } as RpcResponse)
  }
})

/** Nothing this process started may outlive it. */
async function shutdown(): Promise<void> {
  docker.stopEventListener()
  nginx.stopWatcher()
  await workerTails.stopAll()
  await explorer.stopAll()
  cache.close()
  await supervisor.stopAll()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
process.on('disconnect', shutdown)

// Restore saved account from OS keychain, start Docker event listener and Nginx watcher, then announce readiness.
restoreAccount()
void docker.startEventListener()
nginx.startWatcher()

// Auto-start Local Explorer trace receiver server
void explorer.startServer().catch(() => {
  /* ignore port conflicts */
})

send({ kind: 'event', event: 'process', payload: { source: 'core', state: 'running' } } as RpcEvent)
