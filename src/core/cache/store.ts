import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Resource } from '../../shared/model'

/**
 * Local cache store backed by SQLite (better-sqlite3).
 *
 * Provides instant startup for the desktop app by caching discovered resources,
 * routes, and metadata locally. When the application launches, cached state is
 * served immediately while asynchronous discovery runs in the background.
 */
export class LocalCacheStore {
  private db: Database.Database | null = null
  private dbPath: string

  constructor(customPath?: string) {
    if (customPath) {
      this.dbPath = customPath
    } else {
      const dataDir = process.env.CLOUDFLARE_LOCAL_DATA_DIR || join(homedir(), '.cloudflare-local')
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true })
      }
      this.dbPath = join(dataDir, 'state.db')
    }
    this.init()
  }

  private init(): void {
    try {
      this.db = new Database(this.dbPath)
      // Enable WAL mode for performance
      this.db.pragma('journal_mode = WAL')

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS resources (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          data TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS kv_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)
    } catch {
      // In-memory fallback if disk access is restricted
      try {
        this.db = new Database(':memory:')
      } catch {
        this.db = null
      }
    }
  }

  /** Load all cached resources from disk. */
  loadResources(): Resource[] {
    if (!this.db) return []
    try {
      const stmt = this.db.prepare('SELECT data FROM resources ORDER BY type, name')
      const rows = stmt.all() as Array<{ data: string }>
      return rows.map((r) => JSON.parse(r.data) as Resource)
    } catch {
      return []
    }
  }

  /**
   * Save fresh discovered resources to cache in an atomic transaction.
   * If providerList is specified, only replace resources from those providers.
   */
  saveResources(resources: Resource[], providerIds?: string[]): void {
    if (!this.db) return
    try {
      const now = new Date().toISOString()
      const insert = this.db.prepare(`
        INSERT OR REPLACE INTO resources (id, provider, type, name, data, updated_at)
        VALUES (@id, @provider, @type, @name, @data, @updated_at)
      `)

      const deleteByProvider = this.db.prepare('DELETE FROM resources WHERE provider = ?')

      const txn = this.db.transaction(() => {
        if (providerIds && providerIds.length > 0) {
          for (const pid of providerIds) {
            deleteByProvider.run(pid)
          }
        } else {
          this.db!.exec('DELETE FROM resources')
        }

        for (const res of resources) {
          insert.run({
            id: res.id,
            provider: res.provider,
            type: res.type,
            name: res.name,
            data: JSON.stringify(res),
            updated_at: now,
          })
        }
      })

      txn()
    } catch {
      // Ignore cache write errors
    }
  }

  /** Store a metadata key/value */
  setMeta(key: string, value: string): void {
    if (!this.db) return
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO kv_meta (key, value, updated_at)
        VALUES (?, ?, ?)
      `)
      stmt.run(key, value, new Date().toISOString())
    } catch {
      // ignore
    }
  }

  /** Read a metadata key/value */
  getMeta(key: string): string | null {
    if (!this.db) return null
    try {
      const stmt = this.db.prepare('SELECT value FROM kv_meta WHERE key = ?')
      const row = stmt.get(key) as { value: string } | undefined
      return row?.value ?? null
    } catch {
      return null
    }
  }

  /** Clear all cached state. */
  clear(): void {
    if (!this.db) return
    try {
      this.db.exec('DELETE FROM resources; DELETE FROM kv_meta;')
    } catch {
      // ignore
    }
  }

  /** Cleanly close the database. */
  close(): void {
    if (this.db) {
      try {
        this.db.close()
      } catch {
        // ignore
      }
      this.db = null
    }
  }
}
