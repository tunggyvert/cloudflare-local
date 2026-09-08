import { useEffect, useMemo, useRef, useState } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { EmptyRow, TBody, THead, Table, Td, Th, Tr } from '../components/Table'
import { IconCheck, IconCopy, IconSearch } from '../icons'

export interface LogEntry {
  source: string
  stream: 'stdout' | 'stderr'
  line: string
  at: string
}

function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour12: false })
}

export function LogsView({
  logs,
  busy,
  error,
  onRescan,
}: {
  logs: LogEntry[]
  busy: boolean
  error: string | null
  onRescan: () => void
}) {
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const sources = useMemo(() => {
    const set = new Set<string>()
    for (const l of logs) {
      if (l.source) set.add(l.source)
    }
    return Array.from(set).sort()
  }, [logs])

  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      if (sourceFilter !== 'all' && entry.source !== sourceFilter) {
        return false
      }
      if (search) {
        const q = search.toLowerCase()
        return (
          entry.line.toLowerCase().includes(q) ||
          entry.source.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [logs, sourceFilter, search])

  useEffect(() => {
    if (autoScroll) {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [filteredLogs.length, autoScroll])

  async function handleCopyLogs() {
    if (filteredLogs.length === 0) return
    const text = filteredLogs
      .map((l) => `[${formatTime(l.at)}] [${l.source}] [${l.stream}] ${l.line}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Logs"
        subtitle="Live stdout/stderr from every supervised process"
        busy={busy}
        onRescan={onRescan}
      >
        <button
          onClick={() => void handleCopyLogs()}
          disabled={filteredLogs.length === 0}
          className="flex items-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 type-body-sm font-medium text-ink hover:bg-surface-hover disabled:opacity-50 transition-colors"
          title="Copy displayed logs to clipboard"
        >
          {copied ? (
            <>
              <IconCheck className="h-3.5 w-3.5 text-green-600" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <IconCopy className="h-3.5 w-3.5 text-ink-muted" />
              <span>Copy Logs</span>
            </>
          )}
        </button>
      </PageHeader>

      {error && <ErrorBanner message={error} />}

      {/* Filter and Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search box */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" />
            <input
              type="text"
              placeholder="Search logs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-border bg-surface py-1.5 pl-8 pr-3 type-body-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
          </div>

          {/* Source dropdown */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded border border-border bg-surface px-3 py-1.5 type-body-sm text-ink focus:border-accent focus:outline-none"
          >
            <option value="all">All Sources ({logs.length})</option>
            {sources.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 type-body-sm text-ink-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-border"
            />
            <span>Auto-scroll</span>
          </label>

          <span className="type-code-xs text-ink-muted whitespace-nowrap">
            {filteredLogs.length} line{filteredLogs.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[calc(100vh-17rem)] overflow-y-auto rounded border border-border bg-surface shadow-xs">
        <Table>
          <THead>
            <tr>
              <Th>Time</Th>
              <Th>Source</Th>
              <Th>Line</Th>
            </tr>
          </THead>
          <TBody>
            {filteredLogs.map((entry, i) => (
              <Tr key={i}>
                <Td mono className="whitespace-nowrap text-ink-muted text-xs">
                  {formatTime(entry.at)}
                </Td>
                <Td mono className="whitespace-nowrap text-ink-secondary text-xs">
                  {entry.source}
                </Td>
                <Td mono className={`text-xs break-all ${entry.stream === 'stderr' ? 'text-red-700 font-medium' : 'text-ink'}`}>
                  {entry.line}
                </Td>
              </Tr>
            ))}
            {filteredLogs.length === 0 && (
              <EmptyRow colSpan={3}>
                {logs.length === 0
                  ? 'No supervised processes running.'
                  : 'No logs match your filter criteria.'}
              </EmptyRow>
            )}
          </TBody>
        </Table>
      </div>
    </div>
  )
}
