import { EventEmitter } from 'node:events'
import type Cloudflare from 'cloudflare'
import type { WorkerTailEvent } from '../../shared/model.ts'

export interface ActiveTailSession {
  id: string
  scriptName: string
  url: string
  expiresAt: string
  ws: WebSocket | null
  createdAt: string
}

export class WorkerTailManager extends EventEmitter {
  private activeTails = new Map<string, ActiveTailSession>()
  private getClient: () => Cloudflare | null
  private getAccountId: () => string | null

  constructor(getClient: () => Cloudflare | null, getAccountId: () => string | null) {
    super()
    this.getClient = getClient
    this.getAccountId = getAccountId
  }

  async startTail(
    scriptName: string,
    filter?: { status?: string; search?: string }
  ): Promise<{ ok: boolean; tailId: string; url?: string }> {
    const client = this.getClient()
    const accountId = this.getAccountId()

    if (!client || !accountId) {
      throw new Error('No Cloudflare account configured')
    }

    // If an existing tail session exists for this worker, close it first
    if (this.activeTails.has(scriptName)) {
      await this.stopTail(scriptName)
    }

    // 1. Request tail session from Cloudflare API
    const tailRes = await client.workers.scripts.tail.create(scriptName, {
      account_id: accountId,
      body: filter ? { filters: filter } : {},
    })

    const tailId = tailRes.id
    const wsUrl = tailRes.url
    const expiresAt = tailRes.expires_at

    const session: ActiveTailSession = {
      id: tailId,
      scriptName,
      url: wsUrl,
      expiresAt,
      ws: null,
      createdAt: new Date().toISOString(),
    }

    // 2. Open WebSocket connection to stream logs
    try {
      const ws = new WebSocket(wsUrl, 'trace-v1')
      session.ws = ws

      ws.onopen = () => {
        this.emit('connected', { scriptName, tailId })
      }

      ws.onmessage = (event: MessageEvent) => {
        try {
          const raw = typeof event.data === 'string' ? JSON.parse(event.data) : JSON.parse(event.data.toString())
          const parsed = this.normalizeTailMessage(scriptName, tailId, raw)
          if (parsed) {
            this.emit('tail', { scriptName, event: parsed })
          }
        } catch {
          // Ignore incomplete/non-JSON chunks
        }
      }

      ws.onerror = (err) => {
        this.emit('error', { scriptName, error: String(err) })
      }

      ws.onclose = () => {
        if (this.activeTails.get(scriptName)?.id === tailId) {
          this.activeTails.delete(scriptName)
        }
        this.emit('closed', { scriptName, tailId })
      }

      this.activeTails.set(scriptName, session)
      return { ok: true, tailId, url: wsUrl }
    } catch (err) {
      // Cleanup tail on Cloudflare if socket creation failed
      try {
        await client.workers.scripts.tail.delete(tailId, {
          account_id: accountId,
          script_name: scriptName,
        })
      } catch {
        /* ignore */
      }
      throw new Error(`Failed to establish WebSocket for Worker tail: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async stopTail(scriptName: string): Promise<boolean> {
    const session = this.activeTails.get(scriptName)
    if (!session) return false

    this.activeTails.delete(scriptName)

    // 1. Close WebSocket
    if (session.ws) {
      try {
        session.ws.close()
      } catch {
        /* ignore */
      }
      session.ws = null
    }

    // 2. Delete tail on Cloudflare
    const client = this.getClient()
    const accountId = this.getAccountId()
    if (client && accountId) {
      try {
        await client.workers.scripts.tail.delete(session.id, {
          account_id: accountId,
          script_name: scriptName,
        })
      } catch {
        /* ignore deletion errors if already expired */
      }
    }

    return true
  }

  async stopAll(): Promise<void> {
    const names = Array.from(this.activeTails.keys())
    await Promise.allSettled(names.map((name) => this.stopTail(name)))
  }

  private normalizeTailMessage(
    scriptName: string,
    tailId: string,
    raw: Record<string, unknown>
  ): WorkerTailEvent | null {
    if (!raw) return null

    const eventTimestamp = raw.eventTimestamp
      ? new Date(Number(raw.eventTimestamp)).toISOString()
      : new Date().toISOString()

    const outcome = (raw.outcome as WorkerTailEvent['outcome']) || 'unknown'
    const eventObj = raw.event as {
      request?: {
        method?: string
        url?: string
        headers?: Record<string, string>
        cf?: Record<string, unknown>
      }
      response?: {
        status?: number
      }
    } | undefined

    const rawLogs = (raw.logs as Array<{
      level?: string
      message?: unknown[]
      timestamp?: number
    }>) || []

    const logs: WorkerTailEvent['logs'] = rawLogs.map((l) => ({
      level: (l.level as 'log' | 'warn' | 'error' | 'debug' | 'info') || 'log',
      message: Array.isArray(l.message)
        ? l.message.map((m) => (typeof m === 'object' ? JSON.stringify(m) : String(m)))
        : [String(l.message || '')],
      timestamp: Number(l.timestamp || Date.now()),
    }))

    const rawExceptions = (raw.exceptions as Array<{
      name?: string
      message?: string
      timestamp?: number
    }>) || []

    const exceptions: WorkerTailEvent['exceptions'] = rawExceptions.map((ex) => ({
      name: ex.name || 'Error',
      message: ex.message || 'Unknown error',
      timestamp: Number(ex.timestamp || Date.now()),
    }))

    return {
      id: `${tailId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      scriptName,
      eventTimestamp,
      outcome,
      request: eventObj?.request
        ? {
            method: eventObj.request.method || 'GET',
            url: eventObj.request.url || '',
            headers: eventObj.request.headers,
            cf: eventObj.request.cf,
          }
        : undefined,
      response: eventObj?.response
        ? {
            status: eventObj.response.status ?? 200,
          }
        : undefined,
      logs,
      exceptions,
      executionTimeMs: typeof raw.executionTimeMs === 'number' ? raw.executionTimeMs : undefined,
    }
  }
}
