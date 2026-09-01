import { useEffect, useState } from 'react'
import type { ExplorerTrace } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { StatusDot } from '../components/Status'
import { EmptyRow, Table, TBody, Td, Th, THead, Tr } from '../components/Table'
import {
  IconCheck,
  IconCopy,
  IconPlay,
  IconSearch,
} from '../icons'

export function ExplorerView({
  traces,
  busy,
  error,
  onRescan,
  onClearTraces,
}: {
  traces: ExplorerTrace[]
  busy: boolean
  error: string | null
  onRescan: () => void
  onClearTraces: () => void
}) {
  const [selectedTrace, setSelectedTrace] = useState<ExplorerTrace | null>(null)
  const [search, setSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState<string>('ALL')
  const [statusInfo, setStatusInfo] = useState<{
    running: boolean
    port: number
    traceCount: number
    wranglerDevRunning: boolean
    wranglerProject?: string
  } | null>(null)

  // Wrangler dev launch modal / controls
  const [wranglerPath, setWranglerPath] = useState('')
  const [wranglerPort] = useState('8787')
  const [wranglerBusy, setWranglerBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function loadStatus() {
    try {
      const res = await window.core.invoke('explorer.status', undefined)
      setStatusInfo(res)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void loadStatus()
    const timer = setInterval(() => void loadStatus(), 3000)
    return () => clearInterval(timer)
  }, [])

  async function handleStartWrangler(e: React.FormEvent) {
    e.preventDefault()
    if (!wranglerPath.trim()) return

    setWranglerBusy(true)
    setLocalError(null)
    try {
      await window.core.invoke('explorer.wrangler.start', {
        projectPath: wranglerPath.trim(),
        port: parseInt(wranglerPort, 10) || 8787,
      })
      await loadStatus()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setWranglerBusy(false)
    }
  }

  async function handleStopWrangler() {
    setWranglerBusy(true)
    try {
      await window.core.invoke('explorer.wrangler.stop', undefined)
      await loadStatus()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setWranglerBusy(false)
    }
  }

  async function handleCopy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 2000)
    } catch {
      /* ignore */
    }
  }

  const filteredTraces = traces.filter((t) => {
    if (methodFilter !== 'ALL' && t.method.toUpperCase() !== methodFilter) {
      return false
    }
    if (search) {
      const q = search.toLowerCase()
      return (
        t.url.toLowerCase().includes(q) ||
        (t.scriptName && t.scriptName.toLowerCase().includes(q)) ||
        (t.status && String(t.status).includes(q))
      )
    }
    return true
  })

  return (
    <div>
      <PageHeader
        title="Local Explorer"
        subtitle="Live request traces and timeline from wrangler dev and local Workers"
        busy={busy}
        onRescan={() => {
          void loadStatus()
          onRescan()
        }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={onClearTraces}
            className="rounded border border-border bg-surface px-3 py-1.5 type-body-sm font-medium text-ink hover:bg-surface-hover transition-colors"
          >
            Clear Traces
          </button>
        </div>
      </PageHeader>

      {error && <ErrorBanner message={error} />}
      {localError && <ErrorBanner message={localError} />}

      {/* Trace Server & Wrangler Status Bar */}
      <div className="mb-6 rounded border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <StatusDot tone={statusInfo?.running ? 'healthy' : 'neutral'} />
            <div>
              <div className="type-headline-sm text-ink flex items-center gap-2">
                Local Trace Ingest Server
                <span className="type-code-xs font-mono text-accent-strong">
                  http://127.0.0.1:{statusInfo?.port || 9191}/trace
                </span>
              </div>
              <p className="type-body-sm text-ink-muted">
                Accepts live JSON trace payloads from local Workers, wrangler plugins, and middleware
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {statusInfo?.wranglerDevRunning ? (
              <div className="flex items-center gap-2 rounded bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5">
                <StatusDot tone="healthy" />
                <span className="type-body-sm font-medium text-emerald-700">
                  wrangler dev running: <span className="font-mono">{statusInfo.wranglerProject}</span>
                </span>
                <button
                  onClick={() => void handleStopWrangler()}
                  disabled={wranglerBusy}
                  className="ml-2 rounded bg-red-600 px-2 py-0.5 type-code-xs font-medium text-white hover:bg-red-700"
                >
                  Stop
                </button>
              </div>
            ) : (
              <form onSubmit={handleStartWrangler} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Local project path (e.g. /path/to/worker)"
                  value={wranglerPath}
                  onChange={(e) => setWranglerPath(e.target.value)}
                  className="rounded border border-border bg-surface px-2.5 py-1 type-code-xs text-ink w-64 focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={wranglerBusy || !wranglerPath.trim()}
                  className="flex items-center gap-1 rounded bg-accent px-3 py-1 type-body-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  <IconPlay className="h-3.5 w-3.5" />
                  Run Wrangler
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Traces Explorer Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Trace List (2 cols) */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" />
                <input
                  type="text"
                  placeholder="Search url, script, status…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded border border-border bg-surface py-1.5 pl-8 pr-3 type-body-sm text-ink focus:border-accent focus:outline-none"
                />
              </div>

              {/* Method filter */}
              <div className="flex items-center gap-1 rounded border border-border bg-surface p-0.5">
                {['ALL', 'GET', 'POST', 'PUT', 'DELETE'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethodFilter(m)}
                    className={`rounded px-2 py-0.5 type-code-xs font-medium transition-colors ${
                      methodFilter === m ? 'bg-accent text-white' : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <span className="type-body-sm text-ink-muted">
              {filteredTraces.length} trace{filteredTraces.length === 1 ? '' : 's'}
            </span>
          </div>

          <Table>
            <THead>
              <tr>
                <Th>Method & Path</Th>
                <Th>Status</Th>
                <Th align="right">Latency</Th>
                <Th align="right">Time</Th>
              </tr>
            </THead>
            <TBody>
              {filteredTraces.map((t) => (
                <Tr
                  key={t.id}
                  onClick={() => setSelectedTrace(t)}
                  className={selectedTrace?.id === t.id ? 'bg-surface-hover' : ''}
                >
                  <Td mono className="font-medium text-ink">
                    <div className="flex items-center gap-2 truncate max-w-sm sm:max-w-md">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          t.method === 'GET'
                            ? 'bg-blue-500/10 text-blue-600'
                            : t.method === 'POST'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : t.method === 'DELETE'
                            ? 'bg-red-500/10 text-red-600'
                            : 'bg-amber-500/10 text-amber-600'
                        }`}
                      >
                        {t.method}
                      </span>
                      <span className="truncate">{t.url}</span>
                    </div>
                  </Td>
                  <Td mono>
                    <span
                      className={`text-xs font-semibold ${
                        (t.status || 200) >= 500
                          ? 'text-red-600'
                          : (t.status || 200) >= 400
                          ? 'text-yellow-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {t.status || 200}
                    </span>
                  </Td>
                  <Td mono align="right" className="text-xs text-ink-secondary">
                    {t.durationMs !== undefined ? `${t.durationMs.toFixed(1)}ms` : '—'}
                  </Td>
                  <Td mono align="right" className="text-xs text-ink-muted">
                    {new Date(t.timestamp).toLocaleTimeString()}
                  </Td>
                </Tr>
              ))}
              {filteredTraces.length === 0 && (
                <EmptyRow colSpan={4}>
                  {traces.length === 0
                    ? 'No traces recorded yet. Run wrangler dev or send a request to the trace endpoint.'
                    : 'No traces match your filter.'}
                </EmptyRow>
              )}
            </TBody>
          </Table>
        </div>

        {/* Trace Drill-down / Details (1 col) */}
        <div className="space-y-4">
          <div className="rounded border border-border bg-surface p-4">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
              <h4 className="type-table-header text-ink-muted">Trace Detail</h4>
              {selectedTrace && (
                <button
                  onClick={() => void handleCopy(JSON.stringify(selectedTrace, null, 2), selectedTrace.id)}
                  className="flex items-center gap-1 type-code-xs text-accent-strong hover:underline"
                >
                  {copiedId === selectedTrace.id ? <IconCheck className="h-3 w-3" /> : <IconCopy className="h-3 w-3" />}
                  Copy JSON
                </button>
              )}
            </div>

            {selectedTrace ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="type-code-xs font-bold text-accent-strong">{selectedTrace.method}</span>
                    <span className="type-code-xs font-semibold text-ink">Status: {selectedTrace.status ?? 200}</span>
                  </div>
                  <div className="type-code-sm font-semibold text-ink break-all mt-1">{selectedTrace.url}</div>
                  <div className="type-code-xs text-ink-muted mt-0.5">
                    {new Date(selectedTrace.timestamp).toLocaleString()} ({selectedTrace.durationMs?.toFixed(1)}ms)
                  </div>
                </div>

                {/* Hops timeline */}
                {selectedTrace.hops && selectedTrace.hops.length > 0 && (
                  <div>
                    <div className="type-table-header mb-1.5 text-ink-muted">Path Hops</div>
                    <div className="space-y-1.5 border-l-2 border-accent/40 pl-3">
                      {selectedTrace.hops.map((h, i) => (
                        <div key={i} className="type-body-sm text-xs">
                          <div className="font-semibold text-ink">{h.name}</div>
                          <div className="type-code-xs text-ink-muted">
                            {h.status && <span className="mr-2">status: {h.status}</span>}
                            {h.durationMs !== undefined && <span>{h.durationMs.toFixed(1)}ms</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Headers */}
                {selectedTrace.headers && Object.keys(selectedTrace.headers).length > 0 && (
                  <div>
                    <div className="type-table-header mb-1 text-ink-muted">Headers</div>
                    <pre className="max-h-36 overflow-auto rounded bg-surface-subtle p-2 text-[11px] font-mono border border-border">
                      {JSON.stringify(selectedTrace.headers, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Console logs */}
                {selectedTrace.logs && selectedTrace.logs.length > 0 && (
                  <div>
                    <div className="type-table-header mb-1 text-ink-muted">Logs</div>
                    <div className="space-y-1 rounded bg-[#0c1017] p-2 text-[11px] font-mono text-gray-300 max-h-36 overflow-auto">
                      {selectedTrace.logs.map((l, i) => (
                        <div key={i}>
                          <span className="text-gray-500 mr-1.5">[{l.level}]</span>
                          <span>{l.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exceptions */}
                {selectedTrace.exceptions && selectedTrace.exceptions.length > 0 && (
                  <div>
                    <div className="type-table-header mb-1 text-red-600">Exceptions</div>
                    <div className="space-y-1 rounded bg-red-950/20 border border-red-500/30 p-2 text-[11px] font-mono text-red-400">
                      {selectedTrace.exceptions.map((ex, i) => (
                        <div key={i}>
                          <div>{ex.message}</div>
                          {ex.stack && <pre className="text-[10px] text-red-300/80 mt-1">{ex.stack}</pre>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="type-body-sm text-ink-muted py-8 text-center">
                Select a trace from the timeline to inspect request hops, headers, and logs.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
