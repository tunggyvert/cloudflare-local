import type { Orphan, Resource } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { IconContainer, IconDns, IconLogs, IconOrphan, IconTunnel } from '../icons'
import { PageHeader } from '../components/PageHeader'
import { StatusPill } from '../components/Status'
import { EmptyRow, TBody, THead, Table, Td, Th, Tr } from '../components/Table'
import type { LogEntry } from './LogsView'
import type { View } from './types'

export function DashboardView({
  containers,
  tunnels,
  dnsRecords,
  orphans,
  logs,
  busy,
  error,
  configured,
  onRescan,
  onNavigate,
  onConnect,
}: {
  containers: Resource[]
  tunnels: Resource[]
  dnsRecords: Resource[]
  orphans: Orphan[]
  logs: LogEntry[]
  busy: boolean
  error: string | null
  configured: boolean
  onRescan: () => void
  onNavigate: (v: View) => void
  onConnect: () => void
}) {
  const running = containers.filter((c) => c.meta?.state === 'running').length
  const certain = orphans.filter((o) => o.confidence === 'certain').length
  const likely = orphans.length - certain

  const summary: { view: View; icon: typeof IconContainer; label: string; total: number; detail: string }[] = [
    { view: 'containers', icon: IconContainer, label: 'Containers', total: containers.length, detail: `${running} running` },
    { view: 'tunnels', icon: IconTunnel, label: 'Tunnels', total: tunnels.length, detail: `${tunnels.length} discovered` },
    { view: 'dns', icon: IconDns, label: 'DNS Records', total: dnsRecords.length, detail: `${dnsRecords.length} tunnel CNAMEs` },
    { view: 'orphans', icon: IconOrphan, label: 'Orphans', total: orphans.length, detail: `${certain} certain, ${likely} likely` },
    { view: 'logs', icon: IconLogs, label: 'Logs', total: logs.length, detail: 'live stream' },
  ]

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Local state and Cloudflare state, in one view" busy={busy} onRescan={onRescan} />

      {!configured && (
        <div className="mb-4 flex items-center gap-3 rounded border border-accent/30 bg-accent/5 px-4 py-3">
          <span className="type-body-sm text-ink">No Cloudflare account connected.</span>
          <button
            onClick={onConnect}
            className="type-body-sm font-medium text-accent-strong hover:underline"
          >
            Connect now →
          </button>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      <Table>
        <THead>
          <tr>
            <Th>Category</Th>
            <Th align="right">Total</Th>
            <Th align="right">Detail</Th>
          </tr>
        </THead>
        <TBody>
          {summary.map(({ view, icon: ItemIcon, label, total, detail }) => (
            <Tr key={view} onClick={() => onNavigate(view)}>
              <Td>
                <div className="flex items-center gap-2.5">
                  <ItemIcon className="h-4 w-4 text-ink-faint" />
                  <span className="font-medium">{label}</span>
                </div>
              </Td>
              <Td mono align="right">
                {total}
              </Td>
              <Td align="right" className="text-ink-secondary">
                {detail}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="type-table-header mb-2 text-ink-muted">Recent orphans</div>
          <Table>
            <TBody>
              {orphans.slice(0, 5).map((o, i) => (
                <Tr key={`${o.resource.id}-${i}`}>
                  <Td mono className="font-medium">
                    {o.resource.name}
                  </Td>
                  <Td align="right">
                    <StatusPill tone={o.confidence === 'certain' ? 'critical' : 'warning'}>{o.confidence}</StatusPill>
                  </Td>
                </Tr>
              ))}
              {orphans.length === 0 && <EmptyRow colSpan={2}>Nothing orphaned. Account is clean.</EmptyRow>}
            </TBody>
          </Table>
        </section>

        <section>
          <div className="type-table-header mb-2 text-ink-muted">Recent log lines</div>
          <div className="rounded border border-border bg-surface p-3">
            {logs.length === 0 ? (
              <p className="type-body-sm text-ink-muted">No supervised processes running.</p>
            ) : (
              <div className="space-y-1.5">
                {logs.slice(-8).map((entry, i) => (
                  <div key={i} className="type-code-sm flex gap-2 truncate">
                    <span className="shrink-0 text-ink-faint">{entry.source}</span>
                    <span className={`truncate ${entry.stream === 'stderr' ? 'text-red-700' : 'text-ink-secondary'}`}>
                      {entry.line}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
