import { fork, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type {
  CoreMessage, CoreMethod, CoreRequests, RpcResponse, RpcEvent,
} from '../shared/protocol'

export class CoreClient extends EventEmitter {
  private child?: ChildProcess
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

  start(): void {
    if (this.child) return

    // Built alongside the main process by electron-vite as a second entry.
    const corePath = join(import.meta.dirname, 'core.js')
    const child = fork(corePath, [], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    this.child = child

    child.on('message', (msg: CoreMessage) => {
      if (msg.kind === 'response') {
        const res = msg as RpcResponse
        const p = this.pending.get(res.id)
        if (!p) return
        this.pending.delete(res.id)
        res.ok ? p.resolve(res.result) : p.reject(new Error(res.error?.message ?? 'core error'))
        return
      }
      if (msg.kind === 'event') {
        const ev = msg as RpcEvent
        this.emit('event', ev)
      }
    })

    child.on('exit', (code) => {
      this.child = undefined
      for (const [, p] of this.pending) p.reject(new Error(`core service exited (${code})`))
      this.pending.clear()
      this.emit('event', {
        kind: 'event',
        event: 'process',
        payload: { source: 'core', state: 'stopped', detail: `exit ${code}` },
      })
    })
  }

  invoke<M extends CoreMethod>(
    method: M,
    params: CoreRequests[M]['req'],
  ): Promise<CoreRequests[M]['res']> {
    if (!this.child) return Promise.reject(new Error('core service is not running'))

    const id = randomUUID()
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.child!.send({ kind: 'request', id, method, params } satisfies CoreMessage)
    })
  }

  /**
   * Ask the core to shut down and wait for it. The core stops every supervised
   * cloudflared on the way out, which is what prevents the orphaned tunnels
   * this app is built to eliminate.
   */
  async stop(timeoutMs = 8000): Promise<void> {
    const child = this.child
    if (!child) return

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve() }, timeoutMs)
      child.once('exit', () => { clearTimeout(timer); resolve() })
      child.kill('SIGTERM')
    })
    this.child = undefined
  }
}
