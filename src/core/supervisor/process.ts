import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'

export type ProcessState = 'starting' | 'running' | 'stopped' | 'crashed'

export interface SupervisedOptions {
  /** Stable identifier, e.g. `cloudflared:my-tunnel`. Used as the log source. */
  id: string
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  /** Restart on non-zero exit, with backoff. Off for one-shot commands. */
  restart?: boolean
  maxRestarts?: number
}

/**
 * Real supervision, not fire-and-forget `exec`.
 *
 * The abandoned desktop GUIs in this space all shelled out and hoped. Their
 * failure mode is the one that hurts most: the app quits, cloudflared keeps
 * running, and the user is left with an orphaned tunnel — the exact mess this
 * app is supposed to clean up. So teardown here is guaranteed, not best-effort.
 */
export class SupervisedProcess extends EventEmitter {
  readonly id: string
  private opts: SupervisedOptions
  private child?: ChildProcess
  private restarts = 0
  private stopping = false
  private _state: ProcessState = 'stopped'

  constructor(opts: SupervisedOptions) {
    super()
    this.opts = opts
    this.id = opts.id
  }

  get state(): ProcessState { return this._state }
  get pid(): number | undefined { return this.child?.pid }

  start(): void {
    if (this.child) return
    this.stopping = false
    this.setState('starting')

    const child = spawn(this.opts.command, this.opts.args, {
      cwd: this.opts.cwd,
      env: { ...process.env, ...this.opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child

    child.stdout?.on('data', (b: Buffer) => this.emitLines('stdout', b))
    child.stderr?.on('data', (b: Buffer) => this.emitLines('stderr', b))

    child.on('spawn', () => {
      this.restarts = 0
      this.setState('running')
    })

    child.on('error', (err) => {
      this.child = undefined
      this.setState('crashed', err.message)
    })

    child.on('exit', (code, signal) => {
      this.child = undefined
      if (this.stopping) { this.setState('stopped'); return }

      const detail = `exited with ${signal ? `signal ${signal}` : `code ${code}`}`
      this.setState('crashed', detail)

      if (this.opts.restart && this.restarts < (this.opts.maxRestarts ?? 5)) {
        this.restarts += 1
        // Exponential backoff, capped — a tunnel that cannot reach Cloudflare
        // should not hammer it.
        const delay = Math.min(1000 * 2 ** (this.restarts - 1), 30_000)
        setTimeout(() => { if (!this.stopping) this.start() }, delay)
      }
    })
  }

  /**
   * Graceful stop: SIGTERM, then SIGKILL after a grace period. cloudflared
   * needs the grace period to deregister its connections cleanly — killing it
   * outright is what leaves half-dead tunnels behind.
   */
  async stop(graceMs = 5000): Promise<void> {
    const child = this.child
    if (!child) { this.setState('stopped'); return }

    this.stopping = true
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve() }, graceMs)
      child.once('exit', () => { clearTimeout(timer); resolve() })
      child.kill('SIGTERM')
    })
  }

  private emitLines(stream: 'stdout' | 'stderr', chunk: Buffer): void {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) this.emit('log', { source: this.id, stream, line, at: new Date().toISOString() })
    }
  }

  private setState(state: ProcessState, detail?: string): void {
    this._state = state
    this.emit('state', { source: this.id, state, detail })
  }
}

/** Owns every supervised process so nothing can outlive the app unnoticed. */
export class Supervisor extends EventEmitter {
  private procs = new Map<string, SupervisedProcess>()

  spawn(opts: SupervisedOptions): SupervisedProcess {
    const existing = this.procs.get(opts.id)
    if (existing) return existing

    const proc = new SupervisedProcess(opts)
    proc.on('log', (e) => this.emit('log', e))
    proc.on('state', (e) => this.emit('state', e))
    this.procs.set(opts.id, proc)
    proc.start()
    return proc
  }

  get(id: string): SupervisedProcess | undefined { return this.procs.get(id) }
  list(): SupervisedProcess[] { return [...this.procs.values()] }

  async stop(id: string): Promise<boolean> {
    const proc = this.procs.get(id)
    if (!proc) return false
    await proc.stop()
    this.procs.delete(id)
    return true
  }

  /** Called on app quit. Nothing this app started is allowed to survive it. */
  async stopAll(): Promise<void> {
    await Promise.all([...this.procs.keys()].map((id) => this.stop(id)))
  }
}
