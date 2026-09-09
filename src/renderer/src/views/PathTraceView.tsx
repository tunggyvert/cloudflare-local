import { useEffect, useMemo, useState } from 'react'
import type { PathTrace, PathTraceHop, PathTraceHopKind } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { StatusDot, StatusPill } from '../components/Status'
import { EmptyRow, Table, TBody, Td, Th, THead, Tr } from '../components/Table'

const HOP_ORDER: PathTraceHopKind[] = ['edge', 'worker', 'tunnel', 'nginx', 'container']

const HOP_TITLE: Record<PathTraceHopKind, string> = {
  edge: 'Cloudflare Edge',
  worker: 'Worker',
  tunnel: 'Tunnel',
  nginx: 'Nginx',
  container: 'Container',
}

interface TraceStatus {
  tunnels: Array<{ tunnelId: string; metricsPort: number; reachable: boolean }>
  nginxAccessLogs: Array<{ path: string; hostname?: string; watching: boolean }>
  containersTracked: string[]
}

function hopsByKind(trace: PathTrace): Map<PathTraceHopKind, PathTraceHop[]> {
  const map = new Map<PathTraceHopKind, PathTraceHop[]>()
  for (const hop of trace.hops) {
    const list = map.get(hop.hop) ?? []
    list.push(hop)
    map.set(hop.hop, list)
  }
  return map
}

function HopChip({ present, hop }: { present: boolean; hop?: PathTraceHop }) {
  if (!present || !hop) {
    return (
      <div className="flex-1 min-w-[110px] rounded border border-dashed border-border px-2.5 py-2 opacity-50">
        <div className="type-code-xs text-ink-faint">no data</div>
      </div>
    )
  }
  const critical = hop.status && /^[45]\d\d$|error|exception|crash/i.test(hop.status)
  return (
    <div
      className={`flex-1 min-w-[110px] rounded border px-2.5 py-2 ${
        critical ? 'border-status-critical/40 bg-status-critical/5' : 'border-border bg-surface'
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="type-code-xs font-semibold text-ink">{hop.label}</span>
        {hop.confidence === 'aggregate' && (
          <span title="Health snapshot from that hop's process, not measured for this exact request" className="type-code-xs text-ink-faint">
            ~
          </span>
        )}
      </div>
      <div className="type-code-xs text-ink-muted mt-0.5 space-x-1.5">
        {hop.status && <span className={critical ? 'text-status-critical font-medium' : ''}>{hop.status}</span>}
        {hop.durationMs !== undefined && <span>{hop.durationMs.toFixed(1)}ms</span>}
      </div>
    </div>
  )
}

function TracePipeline({ trace }: { trace: PathTrace }) {
  const byKind = hopsByKind(trace)
  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {HOP_ORDER.map((kind, i) => {
        const hops = byKind.get(kind)
        return (
          <div key={kind} className="flex flex-1 items-stretch gap-1.5 min-w-[110px]">
            <HopChip present={!!hops} hop={hops?.[0]} />
            {i < HOP_ORDER.length - 1 && <div className="w-3 shrink-0 self-center border-t border-dashed border-border-strong" aria-hidden />}
          </div>
        )
      })}
    </div>
  )
}

export function PathTraceView({
  traces,
  busy,
  error,
  onRescan,
  onClearTraces,
}: {
  traces: PathTrace[]
  busy: boolean
  error: string | null
  onRescan: () => void
  onClearTraces: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<TraceStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadStatus() {
      try {
        const res = await window.core.invoke('trace.status', undefined)
        if (!cancelled) setStatus(res)
      } catch {
        /* ignore */
      }
    }
    void loadStatus()
    const timer = setInterval(() => void loadStatus(), 4000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const filtered = useMemo(() => {
    if (!search) return traces
    const q = search.toLowerCase()
    return traces.filter(
      (t) =>
        (t.hostname && t.hostname.toLowerCase().includes(q)) ||
        (t.path && t.path.toLowerCase().includes(q)) ||
        (t.method && t.method.toLowerCase().includes(q)),
    )
  }, [traces, search])

  const selected = traces.find((t) => t.id === selectedId) ?? null

  const sourcesActive = [
    status?.tunnels.some((t) => t.reachable),
    status && status.nginxAccessLogs.length > 0,
    status && status.containersTracked.length > 0,
  ].filter(Boolean).length

  return (
    <div>
      <PageHeader
        title="Path Trace"
        subtitle="Live correlation of requests across the edge, Worker, tunnel, nginx, and container"
        busy={busy}
        onRescan={onRescan}
      >
        <button
          onClick={() => {
            setSelectedId(null)
            onClearTraces()
          }}
          className="rounded border border-border bg-surface px-3 py-1.5 type-body-sm font-medium text-ink hover:bg-surface-hover transition-colors"
        >
          Clear Traces
        </button>
      </PageHeader>

      {error && <ErrorBanner message={error} />}

      {/* Telemetry sources status bar */}
      <div className="mb-6 rounded border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <StatusDot tone={sourcesActive > 0 ? 'healthy' : 'neutral'} />
            <span className="type-body-sm font-medium text-ink">Correlation sources</span>
          </div>
          <div className="type-code-xs text-ink-muted">
            Tunnel metrics:{' '}
            {status && status.tunnels.length > 0
              ? status.tunnels.map((t) => `${t.tunnelId.slice(0, 8)}${t.reachable ? '' : ' (unreachable)'}`).join(', ')
              : 'no running tunnel'}
          </div>
          <div className="type-code-xs text-ink-muted">
            Nginx access logs:{' '}
            {status && status.nginxAccessLogs.length > 0
              ? (status.nginxAccessLogs.some((l) => l.hostname)
                  ? status.nginxAccessLogs.map((l) => l.hostname).filter(Boolean).join(', ')
                  : `${status.nginxAccessLogs.length} active`)
              : 'none'}
          </div>
          <div className="type-code-xs text-ink-muted">
            Containers tracked: {status?.containersTracked.length ?? 0}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              placeholder="Filter by hostname, path, method…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-xs rounded border border-border bg-surface px-2.5 py-1.5 type-body-sm text-ink focus:border-accent focus:outline-none"
            />
            <span className="type-body-sm text-ink-muted whitespace-nowrap">
              {filtered.length} trace{filtered.length === 1 ? '' : 's'}
            </span>
          </div>

          <Table>
            <THead>
              <tr>
                <Th>Hostname / Path</Th>
                <Th>Hops</Th>
                <Th align="right">Updated</Th>
              </tr>
            </THead>
            <TBody>
              {filtered.map((t) => (
                <Tr key={t.id} onClick={() => setSelectedId(t.id)} className={selectedId === t.id ? 'bg-surface-hover' : ''}>
                  <Td mono className="font-medium text-ink">
                    <div className="flex items-center gap-2 truncate max-w-sm">
                      {t.method && <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">{t.method}</span>}
                      <span className="truncate">{t.hostname ?? '(unknown host)'}{t.path ?? ''}</span>
                    </div>
                  </Td>
                  <Td mono>
                    <div className="flex items-center gap-1">
                      {HOP_ORDER.map((kind) => (
                        <span
                          key={kind}
                          title={HOP_TITLE[kind]}
                          className={`h-1.5 w-1.5 rounded-full ${
                            t.hops.some((h) => h.hop === kind) ? 'bg-status-healthy' : 'bg-ink-faint/30'
                          }`}
                        />
                      ))}
                      {!t.complete && <StatusPill tone="warning">live</StatusPill>}
                    </div>
                  </Td>
                  <Td mono align="right" className="text-xs text-ink-muted">
                    {new Date(t.updatedAt).toLocaleTimeString()}
                  </Td>
                </Tr>
              ))}
              {filtered.length === 0 && (
                <EmptyRow colSpan={3}>
                  {traces.length === 0
                    ? 'No requests correlated yet. Traffic through a Worker with tail running, or through the local nginx/tunnel path, will appear here.'
                    : 'No traces match your filter.'}
                </EmptyRow>
              )}
            </TBody>
          </Table>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="rounded border border-border bg-surface p-4">
            <h4 className="type-table-header text-ink-muted border-b border-border pb-3 mb-3">Trace Detail</h4>

            {selected ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="type-code-xs font-bold text-accent-strong">{selected.method ?? ''}</span>
                    {!selected.complete && <StatusPill tone="warning">correlating…</StatusPill>}
                  </div>
                  <div className="type-code-sm font-semibold text-ink break-all mt-1">
                    {selected.hostname ?? '(unknown host)'}
                    {selected.path ?? ''}
                  </div>
                  <div className="type-code-xs text-ink-muted mt-0.5">{new Date(selected.startedAt).toLocaleString()}</div>
                </div>

                <div>
                  <div className="type-table-header mb-1.5 text-ink-muted">Hops</div>
                  <TracePipeline trace={selected} />
                </div>

                <div className="space-y-2">
                  {selected.hops.map((h, i) => (
                    <div key={i} className="rounded border border-border p-2">
                      <div className="flex items-center justify-between">
                        <span className="type-code-xs font-semibold text-ink">
                          {HOP_TITLE[h.hop]} — {h.label}
                        </span>
                        <span className="type-code-xs text-ink-faint">
                          {h.confidence === 'aggregate' ? 'aggregate snapshot' : 'measured'}
                        </span>
                      </div>
                      {h.detail && (
                        <div className="mt-1 space-y-0.5">
                          {Object.entries(h.detail)
                            .filter(([, v]) => v !== undefined)
                            .map(([k, v]) => (
                              <div key={k} className="type-code-xs text-ink-muted">
                                <span className="text-ink-faint">{k}:</span> {k === 'lines' ? null : v}
                              </div>
                            ))}
                          {h.detail.lines && (
                            <pre className="mt-1 max-h-32 overflow-auto rounded bg-[#0c1017] p-2 text-[11px] font-mono text-gray-300 whitespace-pre-wrap">
                              {h.detail.lines}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="type-body-sm text-ink-muted py-8 text-center">Select a trace to see its correlated hops.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
