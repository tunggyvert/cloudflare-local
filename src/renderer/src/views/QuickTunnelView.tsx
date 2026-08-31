import { useState } from 'react'
import type { QuickTunnel, Resource } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { StatusDot, StatusPill, toneFromText } from '../components/Status'
import { IconBolt, IconCheck, IconCopy, IconLink, IconStop } from '../icons'
import type { LogEntry } from './LogsView'

const COMMON_PORTS = ['3000', '5173', '8080', '8000', '80']

export function QuickTunnelView({
  quickTunnels,
  containers,
  logs,
  busy,
  error,
  onStart,
  onStop,
  onRescan,
}: {
  quickTunnels: QuickTunnel[]
  containers: Resource[]
  logs: LogEntry[]
  busy: boolean
  error: string | null
  onStart: (targetUrl: string) => Promise<void>
  onStop: (id: string) => Promise<void>
  onRescan: () => void
}) {
  const [targetInput, setTargetInput] = useState('3000')
  const [starting, setStarting] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  // Extract running docker container ports as quick presets
  const containerPresets = containers
    .filter((c) => c.meta?.state === 'running')
    .flatMap((c) =>
      (c.origins ?? [])
        .filter((o) => o.address)
        .map((o) => ({
          label: `${c.name} (${o.address.replace('http://', '')})`,
          value: o.address,
        })),
    )

  async function handleStartTunnel(urlToStart?: string) {
    const raw = urlToStart || targetInput
    if (!raw.trim()) return

    setStarting(true)
    setLocalError(null)
    try {
      await onStart(raw.trim())
      setTargetInput('')
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  async function handleCopy(url: string, id: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => {
        setCopiedId((curr) => (curr === id ? null : curr))
      }, 2000)
    } catch {
      // Fallback if clipboard API is restricted
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopiedId(id)
      setTimeout(() => {
        setCopiedId((curr) => (curr === id ? null : curr))
      }, 2000)
    }
  }

  const activeTunnels = quickTunnels.filter(
    (t) => t.status === 'starting' || t.status === 'running',
  )
  const pastTunnels = quickTunnels.filter(
    (t) => t.status === 'stopped' || t.status === 'crashed',
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quick Tunnel"
        subtitle="Instantly share a local port over the internet via trycloudflare.com — no account required"
        busy={busy}
        onRescan={onRescan}
      />

      {(error || localError) && <ErrorBanner message={error || localError!} />}

      {/* Launch Card */}
      <div className="rounded border border-border bg-surface p-5">
        <h3 className="type-headline-sm text-ink mb-1 flex items-center gap-2">
          <IconBolt className="h-4 w-4 text-accent-strong" />
          Expose a Local Origin
        </h3>
        <p className="type-body-sm text-ink-muted mb-4">
          Enter a port number (e.g. <span className="font-mono text-ink">3000</span>) or full URL
          (e.g. <span className="font-mono text-ink">http://localhost:8080</span>). Cloudflare will
          assign a random public <span className="font-mono text-ink">*.trycloudflare.com</span> domain.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleStartTunnel()
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="e.g. 3000 or http://localhost:8080"
              className="w-full rounded border border-border bg-surface-subtle px-3.5 py-2 type-code-md text-ink placeholder:text-ink-faint focus:border-accent focus:bg-surface focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={starting || !targetInput.trim()}
            className="flex items-center justify-center gap-2 rounded bg-accent px-4 py-2 type-body-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            <IconBolt className="h-4 w-4" />
            {starting ? 'Starting Tunnel…' : 'Start Quick Tunnel'}
          </button>
        </form>

        {/* Quick presets */}
        <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
          <span className="type-table-header text-ink-faint">Presets:</span>
          {COMMON_PORTS.map((port) => (
            <button
              key={port}
              type="button"
              onClick={() => setTargetInput(port)}
              className="rounded border border-border bg-surface-subtle px-2 py-0.5 type-code-sm text-ink-secondary hover:bg-surface-hover hover:text-ink transition-colors"
            >
              :{port}
            </button>
          ))}
          {containerPresets.length > 0 && (
            <>
              <span className="type-table-header text-ink-faint ml-2">Docker:</span>
              {containerPresets.map((cp, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setTargetInput(cp.value)}
                  className="rounded border border-accent/30 bg-accent/5 px-2 py-0.5 type-code-sm text-accent-strong hover:bg-accent/15 transition-colors"
                  title={`Expose ${cp.value}`}
                >
                  {cp.label}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Active Tunnels */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="type-table-header text-ink-muted">
            Active Quick Tunnels ({activeTunnels.length})
          </h3>
        </div>

        {activeTunnels.length === 0 ? (
          <div className="rounded border border-dashed border-border bg-surface-subtle/50 p-8 text-center">
            <IconBolt className="mx-auto h-8 w-8 text-ink-faint/60 mb-2" />
            <p className="type-body-md font-medium text-ink">No quick tunnels running</p>
            <p className="type-body-sm text-ink-muted mt-1">
              Start one above to get a shareable TryCloudflare link in seconds.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeTunnels.map((t) => {
              const tone = toneFromText(t.status)
              const tunnelLogs = logs.filter((l) => l.source === `quick:${t.id}`)
              const isCopied = copiedId === t.id
              const isLogsOpen = expandedLogId === t.id

              return (
                <div
                  key={t.id}
                  className="overflow-hidden rounded border border-border bg-surface shadow-xs transition-all"
                >
                  {/* Top Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-subtle px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <StatusDot tone={tone} />
                      <span className="type-body-sm font-semibold text-ink">
                        Local Origin:
                      </span>
                      <span className="type-code-sm rounded bg-surface px-2 py-0.5 font-medium text-ink border border-border">
                        {t.targetUrl}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <StatusPill tone={tone}>{t.status}</StatusPill>
                      <button
                        onClick={() => void onStop(t.id)}
                        className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1 type-body-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
                        title="Stop this tunnel"
                      >
                        <IconStop className="h-3.5 w-3.5" />
                        Stop
                      </button>
                    </div>
                  </div>

                  {/* Public Link Card Body */}
                  <div className="p-4">
                    {t.status === 'starting' && !t.publicUrl ? (
                      <div className="flex items-center gap-3 py-2 text-ink-secondary">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                        <span className="type-body-sm">
                          Connecting to Cloudflare Edge and generating public URL…
                        </span>
                      </div>
                    ) : t.publicUrl ? (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded border border-accent/30 bg-accent/5 p-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="type-table-header text-accent-strong uppercase tracking-wider mb-1">
                            Public URL (Shareable Link)
                          </p>
                          <a
                            href={t.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="type-code-md font-semibold text-ink hover:text-accent hover:underline break-all"
                          >
                            {t.publicUrl}
                          </a>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            onClick={() => void handleCopy(t.publicUrl!, t.id)}
                            className={`flex items-center gap-1.5 rounded px-3 py-1.5 type-body-sm font-medium transition-all ${
                              isCopied
                                ? 'bg-green-600 text-white'
                                : 'bg-accent text-white hover:bg-accent/90'
                            }`}
                          >
                            {isCopied ? (
                              <>
                                <IconCheck className="h-4 w-4" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <IconCopy className="h-4 w-4" />
                                Copy Link
                              </>
                            )}
                          </button>

                          <a
                            href={t.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 type-body-sm font-medium text-ink hover:bg-surface-hover transition-colors"
                          >
                            <IconLink className="h-4 w-4 text-ink-muted" />
                            Open
                          </a>
                        </div>
                      </div>
                    ) : null}

                    {t.error && (
                      <div className="mt-3 rounded border border-red-200 bg-red-50 p-2.5 type-body-sm text-red-700">
                        {t.error}
                      </div>
                    )}

                    {/* Collapsible log view */}
                    <div className="mt-3">
                      <button
                        onClick={() =>
                          setExpandedLogId((curr) => (curr === t.id ? null : t.id))
                        }
                        className="type-body-sm text-ink-muted hover:text-ink flex items-center gap-1.5 transition-colors"
                      >
                        <span className="text-xs">
                          {isLogsOpen ? '▼ Hide process logs' : '▶ View process logs'}
                        </span>
                        {tunnelLogs.length > 0 && (
                          <span className="text-xs font-mono">({tunnelLogs.length} lines)</span>
                        )}
                      </button>

                      {isLogsOpen && (
                        <div className="mt-2 max-h-48 overflow-y-auto rounded border border-border bg-surface-subtle p-2.5 font-mono text-xs text-ink-secondary space-y-1">
                          {tunnelLogs.length === 0 ? (
                            <p className="text-ink-faint">No logs received yet.</p>
                          ) : (
                            tunnelLogs.map((l, i) => (
                              <div
                                key={i}
                                className={`truncate ${
                                  l.stream === 'stderr' ? 'text-ink-secondary' : 'text-ink'
                                }`}
                              >
                                <span className="text-ink-faint mr-2">
                                  {new Date(l.at).toLocaleTimeString([], { hour12: false })}
                                </span>
                                {l.line}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* History / Past Tunnels */}
      {pastTunnels.length > 0 && (
        <div className="pt-4 border-t border-border">
          <h3 className="type-table-header text-ink-muted mb-3">
            Recent Stopped Tunnels
          </h3>
          <div className="space-y-2">
            {pastTunnels.slice(-5).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded border border-border bg-surface px-4 py-2 text-sm text-ink-secondary"
              >
                <div className="flex items-center gap-2">
                  <StatusDot tone={t.status === 'crashed' ? 'critical' : 'neutral'} />
                  <span className="font-mono text-ink">{t.targetUrl}</span>
                  {t.publicUrl && (
                    <span className="font-mono text-xs text-ink-muted truncate max-w-xs">
                      ({t.publicUrl})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone={t.status === 'crashed' ? 'critical' : 'neutral'}>
                    {t.status}
                  </StatusPill>
                  <button
                    onClick={() => void handleStartTunnel(t.targetUrl)}
                    className="type-body-sm text-accent-strong hover:underline"
                  >
                    Relaunch
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
