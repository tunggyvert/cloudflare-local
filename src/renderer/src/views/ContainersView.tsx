import type { Resource } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { StatusDot, StatusPill, toneFromText } from '../components/Status'
import { EmptyRow, TBody, THead, Table, Td, Th, Tr } from '../components/Table'
import { IconBolt } from '../icons'

export function ContainersView({
  containers,
  busy,
  error,
  onRescan,
  onStartQuickTunnel,
}: {
  containers: Resource[]
  busy: boolean
  error: string | null
  onRescan: () => void
  onStartQuickTunnel?: (url: string) => void
}) {
  return (
    <div>
      <PageHeader
        title="Containers"
        subtitle={`${containers.length} discovered on the local Docker socket`}
        busy={busy}
        onRescan={onRescan}
      />
      {error && <ErrorBanner message={error} />}

      <Table>
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Origin address</Th>
            <Th align="right">State</Th>
            <Th align="right">Action</Th>
          </tr>
        </THead>
        <TBody>
          {containers.map((c) => {
            const state = c.meta?.state
            const tone = toneFromText(state)
            const originAddress = c.origins?.[0]?.address
            const isRunning = state === 'running'

            return (
              <Tr key={c.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    <StatusDot tone={tone} />
                    <span className="font-medium">{c.name}</span>
                  </div>
                </Td>
                <Td mono className="text-ink-secondary">
                  {originAddress ?? '—'}
                </Td>
                <Td align="right">{state ? <StatusPill tone={tone}>{state}</StatusPill> : '—'}</Td>
                <Td align="right">
                  {isRunning && originAddress && onStartQuickTunnel && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onStartQuickTunnel(originAddress)
                      }}
                      className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-2 py-0.5 type-body-sm font-medium text-accent-strong hover:bg-accent/20 transition-colors"
                      title="Expose via TryCloudflare Quick Tunnel"
                    >
                      <IconBolt className="h-3 w-3" />
                      Quick Tunnel
                    </button>
                  )}
                </Td>
              </Tr>
            )
          })}
          {containers.length === 0 && (
            <EmptyRow colSpan={4}>No containers found. Is Docker running?</EmptyRow>
          )}
        </TBody>
      </Table>
    </div>
  )
}

