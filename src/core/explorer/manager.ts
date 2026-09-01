import { EventEmitter } from 'node:events'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Supervisor } from '../supervisor/process.ts'
import type { ExplorerTrace } from '../../shared/model.ts'

const DEFAULT_EXPLORER_PORT = 9191
const MAX_TRACES = 500

export class LocalExplorerManager extends EventEmitter {
  private supervisor: Supervisor
  private traces: ExplorerTrace[] = []
  private server: Server | null = null
  private port = DEFAULT_EXPLORER_PORT
  private serverRunning = false
  private activeWrangler: { projectPath: string; pid?: number; port?: number } | null = null

  constructor(supervisor: Supervisor) {
    super()
    this.supervisor = supervisor
  }

  getStatus() {
    return {
      running: this.serverRunning,
      port: this.port,
      traceCount: this.traces.length,
      wranglerDevRunning: this.activeWrangler !== null,
      wranglerProject: this.activeWrangler?.projectPath,
    }
  }

  getTraces(limit = 100, scriptName?: string): ExplorerTrace[] {
    let filtered = this.traces
    if (scriptName) {
      filtered = filtered.filter((t) => t.scriptName === scriptName)
    }
    return filtered.slice(-limit).reverse()
  }

  clearTraces(): void {
    this.traces = []
  }

  addTrace(traceInput: Partial<ExplorerTrace>): ExplorerTrace {
    const trace: ExplorerTrace = {
      id: traceInput.id || `trace_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: traceInput.timestamp || new Date().toISOString(),
      source: traceInput.source || 'wrangler',
      scriptName: traceInput.scriptName,
      method: traceInput.method || 'GET',
      url: traceInput.url || '/',
      status: traceInput.status ?? 200,
      durationMs: traceInput.durationMs ?? 0,
      clientIp: traceInput.clientIp,
      userAgent: traceInput.userAgent,
      headers: traceInput.headers,
      logs: traceInput.logs || [],
      exceptions: traceInput.exceptions || [],
      hops: traceInput.hops || [
        { name: 'Cloudflare Edge (wrangler dev)', status: 'local', durationMs: traceInput.durationMs },
        { name: traceInput.scriptName || 'Worker Handler', status: `${traceInput.status ?? 200}` },
      ],
    }

    this.traces.push(trace)
    if (this.traces.length > MAX_TRACES) {
      this.traces.shift()
    }

    this.emit('trace', trace)
    return trace
  }

  /**
   * Start the Local Explorer HTTP receiver server.
   */
  async startServer(port = DEFAULT_EXPLORER_PORT): Promise<{ running: boolean; port: number }> {
    if (this.serverRunning && this.server) {
      return { running: true, port: this.port }
    }

    this.port = port

    return new Promise((resolve, reject) => {
      const srv = createServer((req: IncomingMessage, res: ServerResponse) => {
        // Enable CORS for local tools & browser testing
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Trace-Source')

        if (req.method === 'OPTIONS') {
          res.writeHead(204)
          res.end()
          return
        }

        const url = req.url || '/'

        if (url === '/health' || url === '/status') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(this.getStatus()))
          return
        }

        if (url === '/trace' || url === '/api/trace') {
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Method Not Allowed' }))
            return
          }

          let body = ''
          req.on('data', (chunk) => {
            body += chunk.toString()
            if (body.length > 1e6) {
              req.destroy()
            }
          })

          req.on('end', () => {
            try {
              const data = JSON.parse(body) as Partial<ExplorerTrace>
              const trace = this.addTrace(data)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true, traceId: trace.id }))
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: `Invalid JSON payload: ${String(err)}` }))
            }
          })
          return
        }

        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Not Found' }))
      })

      srv.on('error', (err) => {
        this.serverRunning = false
        reject(err)
      })

      srv.listen(port, '127.0.0.1', () => {
        this.server = srv
        this.serverRunning = true
        resolve({ running: true, port })
      })
    })
  }

  async stopServer(): Promise<{ running: boolean; port: number }> {
    if (!this.server) {
      this.serverRunning = false
      return { running: false, port: this.port }
    }

    return new Promise((resolve) => {
      this.server?.close(() => {
        this.server = null
        this.serverRunning = false
        resolve({ running: false, port: this.port })
      })
    })
  }

  /**
   * Start a supervised wrangler dev process in the given project path.
   */
  async startWrangler(
    projectPath: string,
    port = 8787,
    inspectorPort = 9229
  ): Promise<{ ok: boolean; pid?: number; port?: number; inspectorPort?: number }> {
    if (this.activeWrangler) {
      await this.stopWrangler()
    }

    const processId = 'wrangler:dev'
    const args = ['dev', '--port', String(port), '--inspector-port', String(inspectorPort)]

    const proc = this.supervisor.spawn({
      id: processId,
      command: 'npx',
      args: ['wrangler', ...args],
      cwd: projectPath,
      restart: false,
    })

    this.activeWrangler = {
      projectPath,
      pid: proc.pid,
      port,
    }

    // Ensure trace receiver server is also running
    if (!this.serverRunning) {
      try {
        await this.startServer()
      } catch {
        /* ignore if port in use */
      }
    }

    return {
      ok: true,
      pid: proc.pid,
      port,
      inspectorPort,
    }
  }

  async stopWrangler(): Promise<boolean> {
    if (!this.activeWrangler) return false
    const stopped = await this.supervisor.stop('wrangler:dev')
    this.activeWrangler = null
    return stopped
  }

  async stopAll(): Promise<void> {
    await this.stopWrangler()
    await this.stopServer()
  }
}
