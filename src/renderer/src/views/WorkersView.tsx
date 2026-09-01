import { useEffect, useState, useRef } from 'react'
import type { WorkerSummary, WorkerTailEvent } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { StatusDot, StatusPill } from '../components/Status'
import { EmptyRow, Table, TBody, Td, Th, THead, Tr } from '../components/Table'
import {
  IconClose,
  IconCode,
  IconPlay,
  IconSearch,
  IconStop,
} from '../icons'

export function WorkersView({
  busy,
  error,
  configured,
  onRescan,
  tailLogs,
  activeTailScript,
  onStartTail,
  onStopTail,
}: {
  busy: boolean
  error: string | null
  configured: boolean
  onRescan: () => void
  tailLogs: WorkerTailEvent[]
  activeTailScript: string | null
  onStartTail: (scriptName: string) => Promise<void>
  onStopTail: (scriptName: string) => Promise<void>
}) {
  const [workers, setWorkers] = useState<WorkerSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  // Modals & Panels
  const [selectedWorker, setSelectedWorker] = useState<WorkerSummary | null>(null)
  const [deployModalOpen, setDeployModalOpen] = useState(false)
  const [deployName, setDeployName] = useState('')
  const [deployCode, setDeployCode] = useState(
    `export default {\n  async fetch(request, env, ctx) {\n    return new Response("Hello from Cloudflare Worker!");\n  },\n};\n`
  )
  const [deploying, setDeploying] = useState(false)

  // Tail log filtering
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warn' | 'log'>('all')
  const [logSearch, setLogSearch] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const logContainerRef = useRef<HTMLDivElement>(null)

  async function loadWorkers() {
    if (!configured) return
    setLoading(true)
    setLocalError(null)
    try {
      const res = await window.core.invoke('workers.list', undefined)
      setWorkers(res.workers || [])
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadWorkers()
  }, [configured])

  // Auto scroll tail log container
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [tailLogs, autoScroll])

  async function handleDeploy(e: React.FormEvent) {
    e.preventDefault()
    if (!deployName.trim() || !deployCode.trim()) return

    setDeploying(true)
    setLocalError(null)
    try {
      await window.core.invoke('workers.deploy', {
        scriptName: deployName.trim(),
        code: deployCode,
      })
      setDeployModalOpen(false)
      setDeployName('')
      await loadWorkers()
      onRescan()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeploying(false)
    }
  }

  const filteredWorkers = workers.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    (w.routes && w.routes.some((r) => r.toLowerCase().includes(search.toLowerCase())))
  )

  const filteredLogs = tailLogs.filter((l) => {
    if (logFilter === 'error' && l.outcome !== 'exception' && !l.logs.some((item) => item.level === 'error')) {
      return false
    }
    if (logFilter === 'warn' && !l.logs.some((item) => item.level === 'warn')) {
      return false
    }
    if (logSearch) {
      const q = logSearch.toLowerCase()
      const matchesReq = l.request?.url.toLowerCase().includes(q) || l.request?.method.toLowerCase().includes(q)
      const matchesMsg = l.logs.some((item) => item.message.join(' ').toLowerCase().includes(q))
      const matchesEx = l.exceptions.some((item) => item.message.toLowerCase().includes(q))
      return matchesReq || matchesMsg || matchesEx
    }
    return true
  })

  return (
    <div>
      <PageHeader
        title="Cloudflare Workers"
        subtitle="List scripts, inspect bindings, deploy code, and tail live logs"
        busy={busy || loading}
        onRescan={() => {
          void loadWorkers()
          onRescan()
        }}
      >
        {configured && (
          <button
            onClick={() => setDeployModalOpen(true)}
            className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 type-body-sm font-medium text-white hover:bg-accent/90 transition-colors"
          >
            <IconCode className="h-4 w-4" />
            Deploy Worker
          </button>
        )}
      </PageHeader>

      {error && <ErrorBanner message={error} />}
      {localError && <ErrorBanner message={localError} />}

      {!configured && (
        <div className="mb-6 rounded border border-border bg-surface p-4 text-center">
          <p className="type-body-sm text-ink-secondary">
            Connect your Cloudflare account to view and manage Workers.
          </p>
        </div>
      )}

      {configured && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Workers Table (2 cols) */}
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" />
                <input
                  type="text"
                  placeholder="Filter workers or routes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded border border-border bg-surface py-1.5 pl-8 pr-3 type-body-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                />
              </div>
              <span className="type-body-sm text-ink-muted">
                {filteredWorkers.length} script{filteredWorkers.length === 1 ? '' : 's'}
              </span>
            </div>

            <Table>
              <THead>
                <tr>
                  <Th>Worker Name</Th>
                  <Th>Routes / Domains</Th>
                  <Th>Bindings</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </THead>
              <TBody>
                {filteredWorkers.map((w) => {
                  const isTailing = activeTailScript === w.name
                  return (
                    <Tr
                      key={w.id}
                      onClick={() => setSelectedWorker(w)}
                      className={selectedWorker?.id === w.id ? 'bg-surface-hover' : ''}
                    >
                      <Td mono className="font-medium">
                        <div className="flex items-center gap-2">
                          <StatusDot tone={isTailing ? 'healthy' : 'neutral'} />
                          <span className="text-ink">{w.name}</span>
                        </div>
                      </Td>
                      <Td mono className="text-xs text-ink-secondary">
                        {w.routes && w.routes.length > 0 ? (
                          <div className="space-y-0.5">
                            {w.routes.slice(0, 2).map((r, i) => (
                              <div key={i} className="truncate max-w-xs">{r}</div>
                            ))}
                            {w.routes.length > 2 && (
                              <span className="text-ink-muted">+{w.routes.length - 2} more</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-ink-muted italic">workers.dev</span>
                        )}
                      </Td>
                      <Td>
                        {w.bindings && w.bindings.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {w.bindings.slice(0, 3).map((b, i) => (
                              <span
                                key={i}
                                className="rounded bg-surface-subtle border border-border px-1.5 py-0.5 type-code-xs text-ink-secondary"
                              >
                                {b.name} ({b.type.replace('_namespace', '').replace('_bucket', '')})
                              </span>
                            ))}
                            {w.bindings.length > 3 && (
                              <span className="type-code-xs text-ink-muted">+{w.bindings.length - 3}</span>
                            )}
                          </div>
                        ) : (
                          <span className="type-body-sm text-ink-muted">—</span>
                        )}
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          {isTailing ? (
                            <button
                              onClick={() => void onStopTail(w.name)}
                              className="flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 type-body-sm font-medium text-red-600 hover:bg-red-500/20"
                              title="Stop tailing logs"
                            >
                              <IconStop className="h-3.5 w-3.5" />
                              Stop Tail
                            </button>
                          ) : (
                            <button
                              onClick={() => void onStartTail(w.name)}
                              className="flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 type-body-sm font-medium text-ink hover:bg-surface-hover"
                              title="Stream live logs"
                            >
                              <IconPlay className="h-3.5 w-3.5 text-accent-strong" />
                              Tail Logs
                            </button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
                {filteredWorkers.length === 0 && (
                  <EmptyRow colSpan={4}>
                    {search ? 'No Workers match your search.' : 'No Workers found in account.'}
                  </EmptyRow>
                )}
              </TBody>
            </Table>
          </div>

          {/* Drilldown / Details Sidebar (1 col) */}
          <div className="space-y-4">
            <div className="rounded border border-border bg-surface p-4">
              {selectedWorker ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <h3 className="type-headline-sm text-ink">{selectedWorker.name}</h3>
                      <p className="type-body-sm text-ink-muted">
                        Modified: {selectedWorker.modifiedOn ? new Date(selectedWorker.modifiedOn).toLocaleString() : '—'}
                      </p>
                    </div>
                    <StatusPill tone={activeTailScript === selectedWorker.name ? 'healthy' : 'neutral'}>
                      {activeTailScript === selectedWorker.name ? 'tailing' : 'deployed'}
                    </StatusPill>
                  </div>

                  <div>
                    <div className="type-table-header mb-1.5 text-ink-muted">Compatibility Date</div>
                    <p className="type-code-sm text-ink">{selectedWorker.compatibilityDate || 'Not specified'}</p>
                  </div>

                  <div>
                    <div className="type-table-header mb-1.5 text-ink-muted">Bindings ({selectedWorker.bindings?.length || 0})</div>
                    {selectedWorker.bindings && selectedWorker.bindings.length > 0 ? (
                      <div className="space-y-1.5">
                        {selectedWorker.bindings.map((b, i) => (
                          <div
                            key={i}
                            className="rounded border border-border bg-surface-subtle p-2 text-xs flex flex-col gap-0.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-ink">{b.name}</span>
                              <span className="type-code-xs text-accent-strong">{b.type}</span>
                            </div>
                            {b.targetId && (
                              <span className="type-code-xs text-ink-muted truncate font-mono">
                                ID: {b.targetId}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="type-body-sm text-ink-muted">No resource bindings configured.</p>
                    )}
                  </div>

                  <div className="pt-2 flex gap-2">
                    {activeTailScript === selectedWorker.name ? (
                      <button
                        onClick={() => void onStopTail(selectedWorker.name)}
                        className="flex-1 rounded border border-red-500/40 bg-red-500/10 py-1.5 type-body-sm font-medium text-red-600 hover:bg-red-500/20 text-center"
                      >
                        Stop Tail Logs
                      </button>
                    ) : (
                      <button
                        onClick={() => void onStartTail(selectedWorker.name)}
                        className="flex-1 rounded bg-accent py-1.5 type-body-sm font-medium text-white hover:bg-accent/90 text-center"
                      >
                        Start Live Tail
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-ink-muted type-body-sm">
                  Select a Worker from the table to inspect details and bindings.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Tail Streaming Console */}
      {activeTailScript && (
        <div className="mt-8 rounded border border-accent/40 bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-subtle px-4 py-3">
            <div className="flex items-center gap-2">
              <StatusDot tone="healthy" />
              <h3 className="type-headline-sm text-ink">
                Live Tail: <span className="font-mono text-accent-strong">{activeTailScript}</span>
              </h3>
              <span className="type-code-xs text-ink-muted">({filteredLogs.length} events)</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Filter controls */}
              <div className="flex items-center gap-1 rounded border border-border bg-surface p-0.5">
                {(['all', 'log', 'warn', 'error'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setLogFilter(lvl)}
                    className={`rounded px-2 py-0.5 type-body-sm capitalize transition-colors ${
                      logFilter === lvl ? 'bg-accent text-white font-medium' : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              <div className="relative">
                <IconSearch className="absolute left-2 top-2 h-3.5 w-3.5 text-ink-muted" />
                <input
                  type="text"
                  placeholder="Filter logs…"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="rounded border border-border bg-surface py-1 pl-7 pr-2 type-code-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none w-36 sm:w-48"
                />
              </div>

              <label className="flex items-center gap-1.5 type-body-sm text-ink-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-border"
                />
                Auto-scroll
              </label>

              <button
                onClick={() => void onStopTail(activeTailScript)}
                className="flex items-center gap-1 rounded bg-red-600 px-2.5 py-1 type-body-sm font-medium text-white hover:bg-red-700"
              >
                <IconStop className="h-3.5 w-3.5" />
                Stop
              </button>
            </div>
          </div>

          <div
            ref={logContainerRef}
            className="h-80 overflow-y-auto p-4 font-mono text-xs space-y-2 bg-[#0c1017] text-gray-200"
          >
            {filteredLogs.length === 0 ? (
              <p className="text-gray-500 italic py-4 text-center">
                Listening for incoming requests and logs from {activeTailScript}…
              </p>
            ) : (
              filteredLogs.map((item) => (
                <div
                  key={item.id}
                  className={`rounded p-2 border ${
                    item.outcome === 'exception'
                      ? 'border-red-500/40 bg-red-950/20'
                      : 'border-gray-800 bg-gray-900/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-gray-400 text-[11px] mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-accent-strong">
                        {item.request?.method || 'EVENT'}
                      </span>
                      <span className="text-gray-300 truncate max-w-md">
                        {item.request?.url || '/'}
                      </span>
                      {item.response && (
                        <span
                          className={`font-semibold ${
                            item.response.status >= 500
                              ? 'text-red-400'
                              : item.response.status >= 400
                              ? 'text-yellow-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {item.response.status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.executionTimeMs !== undefined && (
                        <span>{item.executionTimeMs.toFixed(1)}ms</span>
                      )}
                      <span>{new Date(item.eventTimestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  {item.logs && item.logs.length > 0 && (
                    <div className="space-y-1 my-1 pl-2 border-l border-gray-700">
                      {item.logs.map((l, lIdx) => (
                        <div
                          key={lIdx}
                          className={`text-[11px] ${
                            l.level === 'error'
                              ? 'text-red-300'
                              : l.level === 'warn'
                              ? 'text-yellow-300'
                              : 'text-gray-300'
                          }`}
                        >
                          <span className="text-gray-500 mr-2">[{l.level}]</span>
                          <span>{l.message.join(' ')}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {item.exceptions && item.exceptions.length > 0 && (
                    <div className="space-y-1 my-1 pl-2 border-l border-red-500 text-red-400 text-[11px]">
                      {item.exceptions.map((ex, exIdx) => (
                        <div key={exIdx}>
                          <span className="font-semibold">{ex.name}:</span> {ex.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Deploy Worker Modal */}
      {deployModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
          <div className="w-full max-w-2xl rounded border border-border bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div className="flex items-center gap-2">
                <IconCode className="h-5 w-5 text-accent-strong" />
                <h3 className="type-headline-sm text-ink">Deploy Cloudflare Worker</h3>
              </div>
              <button
                onClick={() => setDeployModalOpen(false)}
                className="rounded p-1 text-ink-muted hover:bg-surface-hover"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleDeploy} className="space-y-4">
              <div>
                <label className="block type-table-header mb-1 text-ink-muted">Script Name</label>
                <input
                  type="text"
                  placeholder="e.g. my-api-worker"
                  required
                  value={deployName}
                  onChange={(e) => setDeployName(e.target.value)}
                  className="w-full rounded border border-border bg-surface px-3 py-2 type-body-sm text-ink focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block type-table-header mb-1 text-ink-muted">JavaScript / TypeScript Code (ESM)</label>
                <textarea
                  rows={10}
                  required
                  value={deployCode}
                  onChange={(e) => setDeployCode(e.target.value)}
                  className="w-full rounded border border-border bg-surface p-3 font-mono text-xs text-ink focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeployModalOpen(false)}
                  className="rounded border border-border px-4 py-2 type-body-sm text-ink hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deploying}
                  className="rounded bg-accent px-4 py-2 type-body-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  {deploying ? 'Deploying…' : 'Deploy Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
