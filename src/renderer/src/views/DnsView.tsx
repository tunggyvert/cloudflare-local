import type { Resource } from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { StatusPill } from '../components/Status'
import { EmptyRow, TBody, THead, Table, Td, Th, Tr } from '../components/Table'

export function DnsView({
  dnsRecords,
  tunnels,
  busy,
  error,
  onRescan,
}: {
  dnsRecords: Resource[]
  tunnels: Resource[]
  busy: boolean
  error: string | null
  onRescan: () => void
}) {
  return (
    <div>
      <PageHeader
        title="DNS Records"
        subtitle={`${dnsRecords.length} discovered on the connected Cloudflare account`}
        busy={busy}
        onRescan={onRescan}
      />
      {error && <ErrorBanner message={error} />}

      <Table>
        <THead>
          <tr>
            <Th>Record Name</Th>
            <Th>Target</Th>
            <Th>Tunnel</Th>
            <Th>Proxied</Th>
            <Th align="right">Status</Th>
          </tr>
        </THead>
        <TBody>
          {dnsRecords.map((r) => {
            const pointsAtTunnel = r.meta?.pointsAtTunnel
            const targetTunnel = pointsAtTunnel
              ? tunnels.find((t) => t.meta?.tunnelId === pointsAtTunnel || t.name === pointsAtTunnel)
              : undefined

            const tunnelDisplay = pointsAtTunnel ? (
              targetTunnel ? (
                targetTunnel.name
              ) : (
                <span className="text-status-critical">Unknown</span>
              )
            ) : '—'

            const tone = targetTunnel ? 'healthy' : 'critical'
            const statusLabel = targetTunnel ? 'healthy' : 'orphaned'

            return (
              <Tr key={r.id}>
                <Td>
                  <span className="font-medium text-ink">{r.name}</span>
                </Td>
                <Td mono className="text-ink-secondary truncate max-w-[200px]">
                  {r.meta?.content ?? '—'}
                </Td>
                <Td>{tunnelDisplay}</Td>
                <Td>{r.meta?.proxied === 'true' || r.meta?.proxied === '1' ? 'Yes' : 'No'}</Td>
                <Td align="right">
                  {pointsAtTunnel ? <StatusPill tone={tone}>{statusLabel}</StatusPill> : '—'}
                </Td>
              </Tr>
            )
          })}
          {dnsRecords.length === 0 && (
            <EmptyRow colSpan={5}>Connect a Cloudflare account to see DNS records.</EmptyRow>
          )}
        </TBody>
      </Table>
    </div>
  )
}
