import { useEffect, useRef } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { EmptyRow, TBody, THead, Table, Td, Th, Tr } from '../components/Table'

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
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs.length])

  return (
    <div>
      <PageHeader
        title="Logs"
        subtitle="Live stdout/stderr from every supervised process"
        busy={busy}
        onRescan={onRescan}
      />
      {error && <ErrorBanner message={error} />}

      <div ref={scrollRef} className="max-h-[calc(100vh-13rem)] overflow-y-auto rounded border border-border bg-surface">
        <Table>
          <THead>
            <tr>
              <Th>Time</Th>
              <Th>Source</Th>
              <Th>Line</Th>
            </tr>
          </THead>
          <TBody>
            {logs.map((entry, i) => (
              <Tr key={i}>
                <Td mono className="whitespace-nowrap text-ink-muted">
                  {formatTime(entry.at)}
                </Td>
                <Td mono className="whitespace-nowrap text-ink-secondary">
                  {entry.source}
                </Td>
                <Td mono className={entry.stream === 'stderr' ? 'text-red-700' : 'text-ink'}>
                  {entry.line}
                </Td>
              </Tr>
            ))}
            {logs.length === 0 && <EmptyRow colSpan={3}>No supervised processes running.</EmptyRow>}
          </TBody>
        </Table>
      </div>
    </div>
  )
}
