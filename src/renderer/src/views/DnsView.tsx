import { useState } from 'react'
import type { Resource } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { StatusPill } from '../components/Status'
import { EmptyRow, TBody, THead, Table, Td, Th, Tr } from '../components/Table'
import { IconSearch } from '../icons'

export function DnsView({
  dnsRecords,
  tunnels,
  busy,
  error,
  onRescan,
}: {
  dnsRecords: Resource[]
  tunnels: Resource[]
  busy: boolean
  error: string | null
  onRescan: () => void
}) {
  const [search, setSearch] = useState('')

  const filteredRecords = dnsRecords.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    const content = (r.meta?.content ?? '').toLowerCase()
    const name = r.name.toLowerCase()
    const pointsAt = (r.meta?.pointsAtTunnel ?? '').toLowerCase()
    return name.includes(q) || content.includes(q) || pointsAt.includes(q)
  })

  return (
    <div>
      <PageHeader
        title="DNS Records"
        subtitle={`${dnsRecords.length} discovered on the connected Cloudflare account`}
        busy={busy}
        onRescan={onRescan}
      />
      {error && <ErrorBanner message={error} />}

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Filter DNS records by name, target, tunnel…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-border bg-surface py-1.5 pl-8 pr-3 type-body-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
        </div>
        <span className="type-body-sm text-ink-muted">
          {filteredRecords.length} record{filteredRecords.length === 1 ? '' : 's'}
        </span>
      </div>

      <Table>
        <THead>
          <tr>
            <Th>Record Name</Th>
            <Th>Target</Th>
            <Th>Tunnel</Th>
            <Th>Proxy Status</Th>
            <Th align="right">Status</Th>
          </tr>
        </THead>
        <TBody>
          {filteredRecords.map((r) => {
            const pointsAtTunnel = r.meta?.pointsAtTunnel
            const targetTunnel = pointsAtTunnel
              ? tunnels.find((t) => t.meta?.tunnelId === pointsAtTunnel || t.name === pointsAtTunnel)
              : undefined

            const tunnelDisplay = pointsAtTunnel ? (
              targetTunnel ? (
                targetTunnel.name
              ) : (
                <span className="text-status-critical">Unknown</span>
              )
            ) : '—'

            const tone = targetTunnel ? 'healthy' : 'critical'
            const statusLabel = targetTunnel ? 'healthy' : 'orphaned'
            const isProxied = r.meta?.proxied === 'true' || r.meta?.proxied === '1'

            return (
              <Tr key={r.id}>
                <Td>
                  <span className="font-medium text-ink">{r.name}</span>
                </Td>
                <Td mono className="text-ink-secondary truncate max-w-[200px]">
                  {r.meta?.content ?? '—'}
                </Td>
                <Td>{tunnelDisplay}</Td>
                <Td>
                  {isProxied ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 type-code-xs font-semibold text-amber-700">
                      Proxied
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-surface-subtle border border-border px-1.5 py-0.5 type-code-xs font-medium text-ink-muted">
                      DNS Only
                    </span>
                  )}
                </Td>
                <Td align="right">
                  {pointsAtTunnel ? <StatusPill tone={tone}>{statusLabel}</StatusPill> : '—'}
                </Td>
              </Tr>
            )
          })}
          {filteredRecords.length === 0 && (
            <EmptyRow colSpan={5}>
              {dnsRecords.length === 0
                ? 'Connect a Cloudflare account to see DNS records.'
                : 'No DNS records match your filter.'}
            </EmptyRow>
          )}
        </TBody>
      </Table>
    </div>
  )
}
