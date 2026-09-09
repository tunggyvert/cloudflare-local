import { useState, Fragment } from 'react'
import type { Resource } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { StatusDot, StatusPill, toneFromText } from '../components/Status'
import { EmptyRow, TBody, THead, Table, Td, Th, Tr } from '../components/Table'
import { IconChevron, IconSearch } from '../icons'

function formatDate(iso?: string): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString() } catch { return '—' }
}

export function TunnelsView({
  tunnels,
  busy,
  error,
  onRescan,
}: {
  tunnels: Resource[]
  busy: boolean
  error: string | null
  onRescan: () => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filteredTunnels = tunnels.filter((t) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.name.toLowerCase().includes(q) ||
      (t.meta?.status && t.meta.status.toLowerCase().includes(q)) ||
      (t.routes && t.routes.some((r) => r.hostname.toLowerCase().includes(q) || (r.originId && r.originId.toLowerCase().includes(q))))
    )
  })

  return (
    <div>
      <PageHeader
        title="Tunnels"
        subtitle={`${tunnels.length} discovered on the connected Cloudflare account`}
        busy={busy}
        onRescan={onRescan}
      />
      {error && <ErrorBanner message={error} />}

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Filter tunnels by name or hostname…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-border bg-surface py-1.5 pl-8 pr-3 type-body-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
        </div>
        <span className="type-body-sm text-ink-muted">
          {filteredTunnels.length} tunnel{filteredTunnels.length === 1 ? '' : 's'}
        </span>
      </div>

      <Table>
        <THead>
          <tr>
            <Th>Name</Th>
            <Th align="right">Ingress rules</Th>
            <Th align="right">Connections</Th>
            <Th align="right">Created</Th>
            <Th align="right">Status</Th>
          </tr>
        </THead>
        <TBody>
          {filteredTunnels.map((t) => {
            const status = t.meta?.status
            const tone = toneFromText(status)
            const isExpanded = expandedId === t.id
            return (
              <Fragment key={t.id}>
                <Tr onClick={() => setExpandedId(isExpanded ? null : t.id)}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <IconChevron
                        className={`h-3.5 w-3.5 transition-transform ${
                          isExpanded ? 'rotate-90 text-ink' : 'text-ink-muted'
                        }`}
                      />
                      <StatusDot tone={tone} />
                      <span className="font-medium">{t.name}</span>
                    </div>
                  </Td>
                  <Td mono align="right" className="text-ink-secondary">
                    {t.routes?.length ?? 0}
                  </Td>
                  <Td mono align="right" className="text-ink-secondary">
                    {t.meta?.connections ?? '0'}
                  </Td>
                  <Td mono align="right" className="text-ink-secondary">
                    {formatDate(t.meta?.createdAt)}
                  </Td>
                  <Td align="right">{status ? <StatusPill tone={tone}>{status}</StatusPill> : '—'}</Td>
                </Tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={5} className="bg-surface-subtle border-t border-border px-6 py-4">
                      <h4 className="type-table-header text-ink-muted mb-2">Ingress Rules</h4>
                      {t.routes && t.routes.length > 0 ? (
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr>
                              <th className="font-medium text-ink-secondary py-1 w-1/3">Hostname</th>
                              <th className="font-medium text-ink-secondary py-1 w-1/3">Path</th>
                              <th className="font-medium text-ink-secondary py-1 w-1/3">Service</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.routes.map((route, i) => (
                              <tr key={i} className="border-t border-border/50 first:border-0">
                                <td className="py-2 text-ink">{route.hostname}</td>
                                <td className="py-2 text-ink-secondary">{route.path || '—'}</td>
                                <td className="py-2 text-ink-secondary type-code-sm">{route.originId || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-ink-muted type-body-sm">No ingress rules configured</div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
          {filteredTunnels.length === 0 && (
            <EmptyRow colSpan={5}>
              {tunnels.length === 0
                ? 'Connect a Cloudflare account to see tunnels.'
                : 'No tunnels match your filter.'}
            </EmptyRow>
          )}
        </TBody>
      </Table>
    </div>
  )
}
