import React, { useState } from 'react'
import type { ApplyResult, Change, Orphan } from '../../../shared/model'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { StatusPill } from '../components/Status'
import { EmptyRow, TBody, THead, Table, Td, Th, Tr } from '../components/Table'

export function OrphansView({
  orphans,
  busy,
  error,
  onRescan,
}: {
  orphans: Orphan[]
  busy: boolean
  error: string | null
  onRescan: () => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<Change[]>([])
  const [cleaning, setCleaning] = useState(false)
  const [results, setResults] = useState<ApplyResult[] | null>(null)

  const certainOrphans = orphans.filter((o) => o.confidence === 'certain')
  const selectedCertainOrphans = certainOrphans.filter((o) => selectedIds.has(o.cleanup.id))
  
  const handleToggleSelectAll = () => {
    if (selectedIds.size === certainOrphans.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(certainOrphans.map((o) => o.cleanup.id)))
    }
  }

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  async function handleCleanup() {
    setCleaning(true)
    try {
      const { results } = await window.core.invoke('orphan.cleanup', {
        changeIds: pendingChanges.map(c => c.id)
      })
      setResults(results)
      setConfirmOpen(false)
      setPendingChanges([])
      setSelectedIds(new Set())
      // Re-scan to refresh orphan list
      onRescan()
    } catch (err) {
      // Show error
    } finally {
      setCleaning(false)
    }
  }

  const handleCleanCertain = () => {
    const changes = selectedCertainOrphans.map((o) => o.cleanup)
    setPendingChanges(changes)
    setConfirmOpen(true)
  }

  const handleCleanLikely = (change: Change, e: React.MouseEvent) => {
    e.stopPropagation()
    setPendingChanges([change])
    setConfirmOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Orphans"
        subtitle={
          orphans.length === 0
            ? 'Account is clean'
            : `${orphans.length} resource${orphans.length === 1 ? '' : 's'} nothing references any more`
        }
        busy={busy}
        onRescan={onRescan}
      >
        {certainOrphans.length > 0 && selectedIds.size > 0 && (
          <button
            onClick={handleCleanCertain}
            className="type-body-sm rounded bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700"
          >
            Clean {selectedIds.size} certain
          </button>
        )}
      </PageHeader>
      
      {error && <ErrorBanner message={error} />}

      {results && (
        <div className="mb-4 rounded border border-border bg-surface-subtle p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="type-body-sm font-medium text-ink">Cleanup Results</h3>
            <button
              onClick={() => setResults(null)}
              className="type-body-sm text-ink-muted hover:text-ink"
            >
              Dismiss
            </button>
          </div>
          <div className="space-y-1">
            {results.map((r, i) => (
              <div
                key={i}
                className={`type-body-sm ${r.ok ? 'text-green-600' : 'text-red-600'}`}
              >
                {r.changeId}: {r.ok ? 'Success' : `Failed - ${r.error}`}
              </div>
            ))}
          </div>
        </div>
      )}

      <Table>
        <THead>
          <tr>
            <Th>
              {certainOrphans.length > 0 && (
                <input
                  type="checkbox"
                  checked={selectedIds.size === certainOrphans.length}
                  onChange={handleToggleSelectAll}
                />
              )}
            </Th>
            <Th>Resource</Th>
            <Th>Type</Th>
            <Th>Reason</Th>
            <Th align="right">Confidence</Th>
            <Th align="right">Action</Th>
          </tr>
        </THead>
        <TBody>
          {orphans.map((o) => {
            const isCertain = o.confidence === 'certain'
            const isExpanded = expandedId === o.cleanup.id

            return (
              <React.Fragment key={o.cleanup.id}>
                <Tr onClick={() => handleToggleExpand(o.cleanup.id)}>
                  <Td>
                    {isCertain && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(o.cleanup.id)}
                        onClick={(e) => handleToggleSelect(o.cleanup.id, e)}
                        onChange={() => {}}
                      />
                    )}
                  </Td>
                  <Td mono className="font-medium text-ink">
                    {o.resource.name}
                  </Td>
                  <Td className="type-body-sm text-ink-secondary">{o.resource.type}</Td>
                  <Td className="text-ink-secondary">{o.reason}</Td>
                  <Td align="right">
                    <StatusPill tone={isCertain ? 'critical' : 'warning'}>
                      {o.confidence}
                    </StatusPill>
                  </Td>
                  <Td align="right">
                    {!isCertain && (
                      <button
                        onClick={(e) => handleCleanLikely(o.cleanup, e)}
                        className="type-body-sm font-medium text-red-600 hover:text-red-700"
                      >
                        Clean up
                      </button>
                    )}
                  </Td>
                </Tr>

                {isExpanded && (
                  <tr>
                    <td
                      colSpan={6}
                      className="border-t border-border bg-surface-subtle px-6 py-4"
                    >
                      <div className="type-body-sm font-medium text-ink">
                        {o.cleanup.summary}
                      </div>
                      {o.cleanup.destructive && (
                        <div className="type-body-sm mt-1 text-red-600">
                          ⚠ Destructive — this action cannot be undone
                        </div>
                      )}
                      <div className="mt-2 space-y-1">
                        {o.cleanup.fields.map((f) => (
                          <div key={f.path} className="flex gap-2">
                            <span className="font-mono text-ink-muted">{f.path}:</span>
                            <span className="text-red-600 line-through">
                              {f.before ?? '—'}
                            </span>
                            <span className="text-ink-muted">→</span>
                            <span
                              className={f.after ? 'text-green-600' : 'text-ink-muted'}
                            >
                              {f.after ?? '(deleted)'}
                            </span>
                          </div>
                        ))}
                      </div>
                      {!isCertain && (
                        <div className="mt-3">
                          <button
                            onClick={(e) => handleCleanLikely(o.cleanup, e)}
                            className="type-body-sm font-medium text-red-600 hover:text-red-700"
                          >
                            Clean up
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
          {orphans.length === 0 && (
            <EmptyRow colSpan={6}>Nothing orphaned. Account is clean.</EmptyRow>
          )}
        </TBody>
      </Table>

      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${pendingChanges.length} orphaned resource${pendingChanges.length === 1 ? '' : 's'}?`}
        description="This will permanently remove the following resources from your Cloudflare account."
        destructive
        confirmLabel={cleaning ? 'Cleaning…' : 'Confirm Cleanup'}
        onCancel={() => {
          setConfirmOpen(false)
          setPendingChanges([])
        }}
        onConfirm={handleCleanup}
      >
        <div className="mt-3 space-y-2">
          {pendingChanges.map((c) => (
            <div
              key={c.id}
              className="rounded border border-border bg-surface-subtle px-3 py-2"
            >
              <div className="type-body-sm font-medium text-ink">{c.summary}</div>
              <div className="type-code-sm mt-1 text-ink-muted">
                {c.fields.map((f) => (
                  <div key={f.path}>
                    {f.path}: {f.before ?? '—'} → {f.after ?? '(deleted)'}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ConfirmDialog>
    </div>
  )
}
