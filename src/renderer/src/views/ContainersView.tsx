import type { Resource } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { StatusDot, StatusPill, toneFromText } from '../components/Status'
import { EmptyRow, TBody, THead, Table, Td, Th, Tr } from '../components/Table'

export function ContainersView({
  containers,
  busy,
  error,
  onRescan,
}: {
  containers: Resource[]
  busy: boolean
  error: string | null
  onRescan: () => void
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
          </tr>
        </THead>
        <TBody>
          {containers.map((c) => {
            const state = c.meta?.state
            const tone = toneFromText(state)
            return (
              <Tr key={c.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    <StatusDot tone={tone} />
                    <span className="font-medium">{c.name}</span>
                  </div>
                </Td>
                <Td mono className="text-ink-secondary">
                  {c.origins?.[0]?.address ?? '—'}
                </Td>
                <Td align="right">{state ? <StatusPill tone={tone}>{state}</StatusPill> : '—'}</Td>
              </Tr>
            )
          })}
          {containers.length === 0 && (
            <EmptyRow colSpan={3}>No containers found. Is Docker running?</EmptyRow>
          )}
        </TBody>
      </Table>
    </div>
  )
}
