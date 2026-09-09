import { useState } from 'react'
import type { Resource } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { StatusDot, StatusPill, toneFromText } from '../components/Status'
import { EmptyRow, TBody, THead, Table, Td, Th, Tr } from '../components/Table'
import { IconBolt, IconLink, IconSearch, IconTag } from '../icons'

export function ContainersView({
  containers,
  busy,
  error,
  onRescan,
  onStartQuickTunnel,
  onExposeContainer,
}: {
  containers: Resource[]
  busy: boolean
  error: string | null
  onRescan: () => void
  onStartQuickTunnel?: (url: string) => void
  onExposeContainer?: (container: Resource) => void
}) {
  const [search, setSearch] = useState('')

  const filteredContainers = containers.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    const name = c.name.toLowerCase()
    const state = (c.meta?.state || '').toLowerCase()
    const address = (c.origins?.[0]?.address || '').toLowerCase()
    const labelHostname = (c.meta?.['dockflare_hostname'] || c.meta?.['cloudflare.hostname'] || '').toLowerCase()
    return name.includes(q) || state.includes(q) || address.includes(q) || labelHostname.includes(q)
  })

  return (
    <div>
      <PageHeader
        title="Containers"
        subtitle={`${containers.length} discovered on the local Docker socket`}
        busy={busy}
        onRescan={onRescan}
      />
      {error && <ErrorBanner message={error} />}

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Filter containers by name, origin, state…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-border bg-surface py-1.5 pl-8 pr-3 type-body-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
        </div>
        <span className="type-body-sm text-ink-muted">
          {filteredContainers.length} container{filteredContainers.length === 1 ? '' : 's'}
        </span>
      </div>

      <Table>
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Origin address</Th>
            <Th align="right">State</Th>
            <Th align="right">Action</Th>
          </tr>
        </THead>
        <TBody>
          {filteredContainers.map((c) => {
            const state = c.meta?.state
            const tone = toneFromText(state)
            const originAddress = c.origins?.[0]?.address
            const isRunning = state === 'running'
            const labelHostname = c.meta?.['dockflare_hostname'] || c.meta?.['cloudflare.hostname']
            const labelTunnel = c.meta?.['dockflare_tunnel'] || c.meta?.['cloudflare.tunnel']

            return (
              <Tr key={c.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    <StatusDot tone={tone} />
                    <span className="font-medium">{c.name}</span>
                    {labelHostname && (
                      <span
                        className="inline-flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 type-code-sm text-[10px] font-medium text-accent-strong"
                        title={`DockFlare label configuration: ${labelHostname}${labelTunnel ? ` (Tunnel: ${labelTunnel})` : ''}`}
                      >
                        <IconTag className="h-3 w-3" />
                        <span>{labelHostname}</span>
                      </span>
                    )}
                  </div>
                </Td>
                <Td mono className="text-ink-secondary">
                  {originAddress ?? '—'}
                </Td>
                <Td align="right">{state ? <StatusPill tone={tone}>{state}</StatusPill> : '—'}</Td>
                <Td align="right">
                  <div className="inline-flex items-center gap-2">
                    {isRunning && onExposeContainer && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onExposeContainer(c)
                        }}
                        className="inline-flex items-center gap-1 rounded bg-accent px-2.5 py-1 type-body-sm font-medium text-white hover:bg-accent/90 transition-colors shadow-2xs"
                        title="Expose at real hostname via Cloudflare Tunnel & DNS"
                      >
                        <IconLink className="h-3 w-3" />
                        Expose
                      </button>
                    )}
                    {isRunning && originAddress && onStartQuickTunnel && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onStartQuickTunnel(originAddress)
                        }}
                        className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-0.5 type-body-sm font-medium text-ink hover:bg-surface-hover transition-colors"
                        title="Expose via TryCloudflare Quick Tunnel"
                      >
                        <IconBolt className="h-3 w-3 text-accent-strong" />
                        Quick
                      </button>
                    )}
                  </div>
                </Td>
              </Tr>
            )
          })}
          {filteredContainers.length === 0 && (
            <EmptyRow colSpan={4}>
              {containers.length === 0
                ? 'No containers found. Is Docker running?'
                : 'No containers match your filter.'}
            </EmptyRow>
          )}
        </TBody>
      </Table>
    </div>
  )
}

