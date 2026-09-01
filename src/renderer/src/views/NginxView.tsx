import { useEffect, useState } from 'react'
import type { NginxServerBlock, NginxUpstream, Resource } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { StatusDot, StatusPill } from '../components/Status'
import { EmptyRow, Table, TBody, Td, Th, THead, Tr } from '../components/Table'
import {
  IconSearch,
  IconServer,
} from '../icons'

export function NginxView({
  busy,
  error,
  onRescan,
}: {
  nginxResources?: Resource[]
  busy: boolean
  error: string | null
  onRescan: () => void
}) {
  const [servers, setServers] = useState<NginxServerBlock[]>([])
  const [upstreams, setUpstreams] = useState<NginxUpstream[]>([])
  const [statusInfo, setStatusInfo] = useState<{
    available: boolean
    configPath?: string
    watchedFiles: string[]
    serversCount: number
    error?: string
  } | null>(null)
  const [customPath, setCustomPath] = useState('')
  const [search, setSearch] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [updatingPath, setUpdatingPath] = useState(false)

  async function loadNginxData() {
    setLocalError(null)
    try {
      const [statusRes, serversRes] = await Promise.all([
        window.core.invoke('nginx.status', undefined),
        window.core.invoke('nginx.servers.list', undefined),
      ])
      setStatusInfo(statusRes)
      setServers(serversRes.servers || [])
      setUpstreams(serversRes.upstreams || [])
      if (statusRes.configPath && !customPath) {
        setCustomPath(statusRes.configPath)
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void loadNginxData()
  }, [])

  async function handleSetPath(e: React.FormEvent) {
    e.preventDefault()
    if (!customPath.trim()) return

    setUpdatingPath(true)
    setLocalError(null)
    try {
      const res = await window.core.invoke('nginx.config.setPath', {
        configPath: customPath.trim(),
      })
      if (!res.ok) {
        setLocalError(res.error || 'Failed to load nginx config path')
      } else {
        await loadNginxData()
        onRescan()
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdatingPath(false)
    }
  }

  const filteredServers = servers.filter(
    (s) =>
      s.serverName.toLowerCase().includes(search.toLowerCase()) ||
      s.listen.some((l) => l.includes(search)) ||
      s.locations.some(
        (loc) =>
          loc.path.toLowerCase().includes(search.toLowerCase()) ||
          (loc.proxyPass && loc.proxyPass.toLowerCase().includes(search.toLowerCase()))
      )
  )

  return (
    <div>
      <PageHeader
        title="Nginx Adapter"
        subtitle="Discovered server blocks, proxy_pass upstreams, and live configuration watcher"
        busy={busy}
        onRescan={() => {
          void loadNginxData()
          onRescan()
        }}
      />

      {error && <ErrorBanner message={error} />}
      {localError && <ErrorBanner message={localError} />}

      {/* Config File & Watcher Status Bar */}
      <div className="mb-6 rounded border border-border bg-surface p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <StatusDot tone={statusInfo?.available ? 'healthy' : 'warning'} />
            <div>
              <div className="type-headline-sm text-ink flex items-center gap-2">
                Nginx Configuration
                <StatusPill tone={statusInfo?.available ? 'healthy' : 'neutral'}>
                  {statusInfo?.available ? 'watching with chokidar' : 'not detected'}
                </StatusPill>
              </div>
              <p className="type-body-sm text-ink-muted">
                {statusInfo?.configPath
                  ? `Active: ${statusInfo.configPath}`
                  : 'No standard nginx.conf found. Specify custom path below.'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSetPath} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="/opt/homebrew/etc/nginx/nginx.conf"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              className="rounded border border-border bg-surface px-3 py-1.5 type-code-xs text-ink w-72 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={updatingPath}
              className="rounded bg-accent px-3 py-1.5 type-body-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {updatingPath ? 'Loading…' : 'Set Path'}
            </button>
          </form>
        </div>

        {/* Watched files accordion/list */}
        {statusInfo?.watchedFiles && statusInfo.watchedFiles.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-muted">Watched files ({statusInfo.watchedFiles.length}):</span>
            {statusInfo.watchedFiles.map((f, i) => (
              <span key={i} className="rounded bg-surface-subtle border border-border px-2 py-0.5 font-mono text-ink-secondary">
                {f}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Discovered Server Blocks Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" />
            <input
              type="text"
              placeholder="Search server name, port, or proxy_pass…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-border bg-surface py-1.5 pl-8 pr-3 type-body-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
          </div>
          <span className="type-body-sm text-ink-muted">
            {filteredServers.length} server block{filteredServers.length === 1 ? '' : 's'}
          </span>
        </div>

        <Table>
          <THead>
            <tr>
              <Th>Server Name</Th>
              <Th>Listen</Th>
              <Th>Locations & Proxy Pass</Th>
              <Th align="right">Source</Th>
            </tr>
          </THead>
          <TBody>
            {filteredServers.map((s, idx) => (
              <Tr key={`${s.serverName}-${idx}`}>
                <Td mono className="font-medium text-ink">
                  <div className="flex items-center gap-2">
                    <IconServer className="h-4 w-4 text-ink-faint" />
                    <span>{s.serverName}</span>
                  </div>
                </Td>
                <Td mono className="text-xs text-ink-secondary">
                  {s.listen.join(', ')}
                </Td>
                <Td>
                  <div className="space-y-1">
                    {s.locations.map((loc, lIdx) => (
                      <div key={lIdx} className="flex items-center gap-2 type-code-xs">
                        <span className="font-semibold text-ink">{loc.path}</span>
                        {loc.proxyPass && (
                          <>
                            <span className="text-ink-muted">→</span>
                            <span className="text-accent-strong font-mono">{loc.proxyPass}</span>
                          </>
                        )}
                        {loc.root && (
                          <span className="text-ink-muted">root: {loc.root}</span>
                        )}
                        {loc.alias && (
                          <span className="text-ink-muted">alias: {loc.alias}</span>
                        )}
                        {loc.returns && (
                          <span className="text-ink-muted">return: {loc.returns}</span>
                        )}
                      </div>
                    ))}
                    {s.locations.length === 0 && (
                      <span className="text-ink-muted text-xs italic">no location blocks</span>
                    )}
                  </div>
                </Td>
                <Td mono align="right" className="text-xs text-ink-muted">
                  <span title={`${s.sourceFile}:${s.line}`}>
                    {s.sourceFile.split('/').pop()}:{s.line}
                  </span>
                </Td>
              </Tr>
            ))}
            {filteredServers.length === 0 && (
              <EmptyRow colSpan={4}>
                {statusInfo?.available
                  ? 'No server blocks found in nginx configuration.'
                  : 'Nginx config not found. Please specify the path to your nginx.conf above.'}
              </EmptyRow>
            )}
          </TBody>
        </Table>
      </div>

      {/* Upstreams Table */}
      {upstreams.length > 0 && (
        <div className="mt-8 space-y-4">
          <h3 className="type-headline-sm text-ink">Upstream Pools ({upstreams.length})</h3>
          <Table>
            <THead>
              <tr>
                <Th>Upstream Name</Th>
                <Th>Backend Servers</Th>
                <Th align="right">Source</Th>
              </tr>
            </THead>
            <TBody>
              {upstreams.map((u, i) => (
                <Tr key={i}>
                  <Td mono className="font-semibold text-ink">
                    {u.name}
                  </Td>
                  <Td mono className="text-xs text-ink-secondary">
                    <div className="flex flex-wrap gap-1">
                      {u.servers.map((srv, sIdx) => (
                        <span key={sIdx} className="rounded bg-surface-subtle border border-border px-1.5 py-0.5">
                          {srv}
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td mono align="right" className="text-xs text-ink-muted">
                    {u.sourceFile.split('/').pop()}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  )
}
