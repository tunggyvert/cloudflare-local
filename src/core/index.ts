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
import { detectOrphans } from './orphans'
import { Supervisor } from './supervisor/process'
import { readToken } from './secrets'
import type { Provider } from './providers/types'
import type { Resource, Service } from '../shared/model'
import type { CoreMessage, RpcRequest, RpcResponse, RpcEvent } from '../shared/protocol'

const VERSION = '0.0.1'

const supervisor = new Supervisor()
const providers: Provider[] = [new DockerProvider()]

let lastDiscovery: Resource[] = []

/* ---- transport ---------------------------------------------------- */

function send(msg: CoreMessage): void {
  process.send?.(msg)
}

function emit<E extends RpcEvent['event']>(event: E, payload: unknown): void {
  send({ kind: 'event', event, payload } as RpcEvent)
}

supervisor.on('log', (e) => emit('log', e))
supervisor.on('state', (e) => emit('process', e))

/* ---- request handling --------------------------------------------- */

async function handle(req: RpcRequest): Promise<unknown> {
  switch (req.method) {
    case 'health':
      return { ok: true, version: VERSION }

    case 'discover': {
      const results = await Promise.allSettled(providers.map((p) => p.discover()))
      lastDiscovery = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))

      for (const [i, r] of results.entries()) {
        if (r.status === 'rejected') {
          emit('process', {
            source: providers[i].id,
            state: 'crashed',
            detail: `discover failed: ${r.reason}`,
          })
        }
      }

      emit('discovered', { count: lastDiscovery.length, at: new Date().toISOString() })
      return { resources: lastDiscovery }
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

  // Attach origins by address match. Crude for v0.1 and knowingly so — proper
  // origin↔route correlation arrives with path tracing in v0.4.
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
  await supervisor.stopAll()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
process.on('disconnect', shutdown)

send({ kind: 'event', event: 'process', payload: { source: 'core', state: 'running' } } as RpcEvent)

// Referenced so the bundler keeps them; wired up when onboarding lands in v0.1.
void CloudflareProvider
void readToken
