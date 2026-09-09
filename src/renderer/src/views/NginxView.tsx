import { useEffect, useState } from 'react'
import type { NginxServerBlock, NginxUpstream, Resource } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
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
  const [search, setSearch] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

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
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void loadNginxData()
  }, [])

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
        subtitle="Discovered server blocks, proxy_pass upstreams, and reverse proxies"
        busy={busy}
        onRescan={() => {
          void loadNginxData()
          onRescan()
        }}
      />

      {error && <ErrorBanner message={error} />}
      {localError && <ErrorBanner message={localError} />}

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
              </Tr>
            ))}
            {filteredServers.length === 0 && (
              <EmptyRow colSpan={3}>
                {statusInfo?.available
                  ? 'No server blocks found in nginx configuration.'
                  : 'No Nginx server blocks detected at standard configuration paths.'}
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
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  )
}

