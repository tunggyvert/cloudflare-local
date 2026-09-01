import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import { NginxParser, type ParsedNginxConfig } from './nginx-parser.ts'
import type { Provider } from './types.ts'
import type { ApplyResult, Change, IaCFragment, Origin, Resource, Route, NginxServerBlock, NginxUpstream } from '../../shared/model.ts'

const CANDIDATE_CONFIG_PATHS = [
  '/opt/homebrew/etc/nginx/nginx.conf', // macOS Homebrew ARM
  '/usr/local/etc/nginx/nginx.conf',   // macOS Homebrew Intel
  '/etc/nginx/nginx.conf',             // Linux standard
]

export interface NginxProviderConfig {
  configPath?: string
}

export class NginxProvider extends EventEmitter implements Provider {
  readonly id = 'nginx' as const
  readonly label = 'Nginx'

  private parser = new NginxParser()
  private customConfigPath?: string
  private activeConfigPath?: string
  private watcher: FSWatcher | null = null
  private lastParsed: ParsedNginxConfig | null = null
  private watching = false

  constructor(cfg?: NginxProviderConfig) {
    super()
    if (cfg?.configPath) {
      this.customConfigPath = resolve(cfg.configPath)
    }
  }

  /**
   * Set or update custom config path at runtime.
   */
  setConfigPath(configPath: string): { ok: boolean; path: string; error?: string } {
    const resolved = resolve(configPath)
    if (!existsSync(resolved)) {
      return { ok: false, path: resolved, error: `Config file not found at ${resolved}` }
    }
    this.customConfigPath = resolved
    this.activeConfigPath = resolved
    if (this.watching) {
      this.restartWatcher()
    }
    return { ok: true, path: resolved }
  }

  getConfigPath(): string | undefined {
    return this.activeConfigPath || this.customConfigPath || this.findDefaultConfigPath()
  }

  getLastParsed(): ParsedNginxConfig | null {
    return this.lastParsed
  }

  async available(): Promise<{ ok: boolean; detail?: string }> {
    const configPath = this.getConfigPath()
    if (!configPath) {
      return { ok: false, detail: 'no nginx.conf found at standard paths or custom path' }
    }

    if (!existsSync(configPath)) {
      return { ok: false, detail: `nginx config path does not exist: ${configPath}` }
    }

    this.activeConfigPath = configPath
    return { ok: true, detail: `config: ${configPath}` }
  }

  private findDefaultConfigPath(): string | undefined {
    for (const candidate of CANDIDATE_CONFIG_PATHS) {
      if (existsSync(candidate)) return candidate
    }
    return undefined
  }

  async discover(): Promise<Resource[]> {
    const configPath = this.getConfigPath()
    if (!configPath || !existsSync(configPath)) {
      return []
    }

    this.activeConfigPath = configPath
    const parsed = this.parser.parseFile(configPath)
    this.lastParsed = parsed

    // Ensure file watcher is running for discovered files
    if (this.watching && this.watcher) {
      this.updateWatcherPaths(parsed.includedFiles)
    }

    const resources: Resource[] = []

    for (let idx = 0; idx < parsed.servers.length; idx++) {
      const s = parsed.servers[idx]
      const serverId = `nginx:server:${s.serverName}:${s.listen.join('-')}:${idx}`

      const routes: Route[] = []
      const origins: Origin[] = []

      for (let locIdx = 0; locIdx < s.locations.length; locIdx++) {
        const loc = s.locations[locIdx]
        const routeId = `nginx:route:${s.serverName}:${loc.path}:${locIdx}`

        let originId: string | undefined
        if (loc.proxyPass) {
          originId = `nginx:origin:${s.serverName}:${loc.proxyPass}:${locIdx}`
          origins.push({
            id: originId,
            provider: 'nginx',
            name: `proxy_pass ${loc.proxyPass}`,
            address: loc.proxyPass,
            state: 'unknown',
            meta: {
              serverName: s.serverName,
              location: loc.path,
              sourceFile: s.sourceFile,
              line: String(s.line),
            },
          })
        }

        routes.push({
          id: routeId,
          provider: 'nginx',
          hostname: s.serverName,
          path: loc.path,
          kind: 'nginx-server-block',
          originId,
        })
      }

      resources.push({
        id: serverId,
        provider: 'nginx',
        type: 'nginx_server',
        name: s.serverName,
        routes,
        origins,
        meta: {
          listen: s.listen.join(', '),
          locationsCount: String(s.locations.length),
          sourceFile: s.sourceFile,
          line: String(s.line),
        },
      })
    }

    return resources
  }

  /**
   * Start chokidar file watcher on nginx config files.
   */
  startWatcher(): void {
    if (this.watching) return
    this.watching = true
    this.restartWatcher()
  }

  private restartWatcher(): void {
    if (this.watcher) {
      void this.watcher.close()
      this.watcher = null
    }

    const configPath = this.getConfigPath()
    if (!configPath || !existsSync(configPath)) {
      return
    }

    const pathsToWatch = new Set<string>()
    pathsToWatch.add(configPath)
    pathsToWatch.add(dirname(configPath))

    if (this.lastParsed?.includedFiles) {
      for (const f of this.lastParsed.includedFiles) {
        pathsToWatch.add(f)
        pathsToWatch.add(dirname(f))
      }
    }

    const watcher = chokidar.watch(Array.from(pathsToWatch), {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    })

    const onFileChange = (path: string, eventType: string) => {
      this.emit('change', {
        event: 'change',
        path,
        detail: `nginx config ${eventType}: ${path}`,
      })
    }

    watcher.on('change', (path) => onFileChange(path, 'modified'))
    watcher.on('add', (path) => onFileChange(path, 'created'))
    watcher.on('unlink', (path) => onFileChange(path, 'deleted'))
    watcher.on('error', (err) => {
      this.emit('error', {
        event: 'error',
        detail: err instanceof Error ? err.message : String(err),
      })
    })

    this.watcher = watcher
  }

  private updateWatcherPaths(includedFiles: string[]): void {
    if (!this.watcher) return
    const configPath = this.getConfigPath()
    const paths = new Set<string>()
    if (configPath) {
      paths.add(configPath)
      paths.add(dirname(configPath))
    }
    for (const f of includedFiles) {
      paths.add(f)
      paths.add(dirname(f))
    }
    this.watcher.add(Array.from(paths))
  }

  stopWatcher(): void {
    this.watching = false
    if (this.watcher) {
      void this.watcher.close()
      this.watcher = null
    }
  }

  getServers(): NginxServerBlock[] {
    return this.lastParsed?.servers ?? []
  }

  getUpstreams(): NginxUpstream[] {
    return this.lastParsed?.upstreams ?? []
  }

  getWatchedFiles(): string[] {
    return this.lastParsed?.includedFiles ?? (this.activeConfigPath ? [this.activeConfigPath] : [])
  }

  async plan(): Promise<Change[]> {
    // v0.3 is read-only for Nginx configs.
    return []
  }

  async apply(change: Change): Promise<ApplyResult> {
    return {
      changeId: change.id,
      ok: false,
      error: 'Nginx provider is read-only in v0.3 — editing nginx configs directly is not supported',
    }
  }

  export(change: Change): IaCFragment {
    return {
      format: 'terraform',
      filename: 'nginx.tf',
      content: `# Nginx resources are local file-backed.\n# ${change.summary}\n`,
    }
  }
}
