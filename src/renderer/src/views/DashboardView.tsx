import type { Orphan, QuickTunnel, Resource } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { IconBolt, IconCheck, IconContainer, IconCopy, IconDns, IconLink, IconLogs, IconOrphan, IconTunnel } from '../icons'
import { PageHeader } from '../components/PageHeader'
import { StatusDot, StatusPill } from '../components/Status'
import { EmptyRow, TBody, THead, Table, Td, Th, Tr } from '../components/Table'
import type { LogEntry } from './LogsView'
import type { View } from './types'
import { useState } from 'react'

export function DashboardView({
  containers,
  tunnels,
  dnsRecords,
  orphans,
  quickTunnels,
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
  quickTunnels: QuickTunnel[]
  logs: LogEntry[]
  busy: boolean
  error: string | null
  configured: boolean
  onRescan: () => void
  onNavigate: (v: View) => void
  onConnect: () => void
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const running = containers.filter((c) => c.meta?.state === 'running').length
  const certain = orphans.filter((o) => o.confidence === 'certain').length
  const likely = orphans.length - certain
  const activeQuick = quickTunnels.filter((t) => t.status === 'starting' || t.status === 'running')

  async function handleCopy(url: string, id: string, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 2000)
    } catch {
      // ignore
    }
  }

  const summary: { view: View; icon: typeof IconContainer; label: string; total: number; detail: string }[] = [
    { view: 'quick-tunnel', icon: IconBolt, label: 'Quick Tunnel', total: activeQuick.length, detail: activeQuick.length > 0 ? `${activeQuick.length} active (trycloudflare)` : 'expose local port' },
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

      {/* Active Quick Tunnels Widget on Dashboard */}
      {activeQuick.length > 0 && (
        <div className="mt-8 rounded border border-accent/40 bg-accent/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <IconBolt className="h-4 w-4 text-accent-strong" />
              <h3 className="type-headline-sm text-ink">Active Quick Tunnels (TryCloudflare)</h3>
            </div>
            <button
              onClick={() => onNavigate('quick-tunnel')}
              className="type-body-sm font-medium text-accent-strong hover:underline"
            >
              Manage all →
            </button>
          </div>

          <div className="space-y-3">
            {activeQuick.map((t) => (
              <div
                key={t.id}
                className="flex flex-col gap-2 rounded border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <StatusDot tone={t.status === 'running' ? 'healthy' : 'warning'} />
                  <span className="type-code-sm font-semibold text-ink">{t.targetUrl}</span>
                  <span className="text-ink-muted">→</span>
                  {t.publicUrl ? (
                    <span className="type-code-sm font-medium text-accent-strong truncate max-w-xs sm:max-w-md">
                      {t.publicUrl}
                    </span>
                  ) : (
                    <span className="type-body-sm text-ink-muted italic">connecting…</span>
                  )}
                </div>

                {t.publicUrl && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => void handleCopy(t.publicUrl!, t.id, e)}
                      className="flex items-center gap-1 rounded bg-accent px-2.5 py-1 type-body-sm font-medium text-white hover:bg-accent/90 transition-colors"
                    >
                      {copiedId === t.id ? (
                        <>
                          <IconCheck className="h-3.5 w-3.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <IconCopy className="h-3.5 w-3.5" />
                          Copy Link
                        </>
                      )}
                    </button>
                    <a
                      href={t.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded border border-border bg-surface px-2.5 py-1 type-body-sm font-medium text-ink hover:bg-surface-hover"
                    >
                      <IconLink className="h-3.5 w-3.5 text-ink-muted" />
                      Open
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
