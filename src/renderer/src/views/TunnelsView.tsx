import { useState, Fragment } from 'react'
import type { Resource } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { StatusDot, StatusPill, toneFromText } from '../components/Status'
import { EmptyRow, TBody, THead, Table, Td, Th, Tr } from '../components/Table'

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

  return (
    <div>
      <PageHeader
        title="Tunnels"
        subtitle={`${tunnels.length} discovered on the connected Cloudflare account`}
        busy={busy}
        onRescan={onRescan}
      />
      {error && <ErrorBanner message={error} />}

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
          {tunnels.map((t) => {
            const status = t.meta?.status
            const tone = toneFromText(status)
            const isExpanded = expandedId === t.id
            return (
              <Fragment key={t.id}>
                <Tr onClick={() => setExpandedId(isExpanded ? null : t.id)}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block transition-transform text-ink-muted ${isExpanded ? 'rotate-90' : ''}`}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M5.5 3.5L11.5 8L5.5 12.5V3.5Z" />
                        </svg>
                      </span>
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
          {tunnels.length === 0 && (
            <EmptyRow colSpan={5}>Connect a Cloudflare account to see tunnels.</EmptyRow>
          )}
        </TBody>
      </Table>
    </div>
  )
}
