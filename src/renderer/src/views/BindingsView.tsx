import { useEffect, useState } from 'react'
import type {
  D1DatabaseInfo,
  D1QueryResult,
  D1TableInfo,
  KVKeyInfo,
  KVNamespaceInfo,
  R2BucketInfo,
  R2ObjectInfo,
} from '../../../shared/model'
import { ErrorBanner } from '../components/ErrorBanner'
import { PageHeader } from '../components/PageHeader'
import { EmptyRow, Table, TBody, Td, Th, THead, Tr } from '../components/Table'
import {
  IconCheck,
  IconCopy,
  IconPlay,
  IconSearch,
  IconStorage,
} from '../icons'

type StorageTab = 'kv' | 'r2' | 'd1'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function BindingsView({
  busy,
  error,
  configured,
  onRescan,
}: {
  busy: boolean
  error: string | null
  configured: boolean
  onRescan: () => void
}) {
  const [tab, setTab] = useState<StorageTab>('kv')
  const [localError, setLocalError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // KV State
  const [kvNamespaces, setKvNamespaces] = useState<KVNamespaceInfo[]>([])
  const [selectedKv, setSelectedKv] = useState<KVNamespaceInfo | null>(null)
  const [kvKeys, setKvKeys] = useState<KVKeyInfo[]>([])
  const [kvPrefix, setKvPrefix] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [keyValue, setKeyValue] = useState<{ value: string | null; isJson?: boolean } | null>(null)
  const [loadingValue, setLoadingValue] = useState(false)

  // R2 State
  const [r2Buckets, setR2Buckets] = useState<R2BucketInfo[]>([])
  const [selectedBucket, setSelectedBucket] = useState<R2BucketInfo | null>(null)
  const [r2Objects, setR2Objects] = useState<R2ObjectInfo[]>([])
  const [r2Prefix, setR2Prefix] = useState('')
  const [selectedObject, setSelectedObject] = useState<R2ObjectInfo | null>(null)

  // D1 State
  const [d1Databases, setD1Databases] = useState<D1DatabaseInfo[]>([])
  const [selectedD1, setSelectedD1] = useState<D1DatabaseInfo | null>(null)
  const [d1Tables, setD1Tables] = useState<D1TableInfo[]>([])
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [d1Query, setD1Query] = useState('SELECT 1 as test;')
  const [queryResult, setQueryResult] = useState<D1QueryResult | null>(null)
  const [runningQuery, setRunningQuery] = useState(false)

  async function handleCopy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 2000)
    } catch {
      /* ignore */
    }
  }

  // Load active tab data
  useEffect(() => {
    if (!configured) return
    setLocalError(null)

    if (tab === 'kv') {
      void (async () => {
        setLoading(true)
        try {
          const res = await window.core.invoke('kv.namespaces.list', undefined)
          setKvNamespaces(res.namespaces || [])
          if (res.namespaces.length > 0 && !selectedKv) {
            setSelectedKv(res.namespaces[0])
          }
        } catch (err) {
          setLocalError(err instanceof Error ? err.message : String(err))
        } finally {
          setLoading(false)
        }
      })()
    } else if (tab === 'r2') {
      void (async () => {
        setLoading(true)
        try {
          const res = await window.core.invoke('r2.buckets.list', undefined)
          setR2Buckets(res.buckets || [])
          if (res.buckets.length > 0 && !selectedBucket) {
            setSelectedBucket(res.buckets[0])
          }
        } catch (err) {
          setLocalError(err instanceof Error ? err.message : String(err))
        } finally {
          setLoading(false)
        }
      })()
    } else if (tab === 'd1') {
      void (async () => {
        setLoading(true)
        try {
          const res = await window.core.invoke('d1.databases.list', undefined)
          setD1Databases(res.databases || [])
          if (res.databases.length > 0 && !selectedD1) {
            setSelectedD1(res.databases[0])
          }
        } catch (err) {
          setLocalError(err instanceof Error ? err.message : String(err))
        } finally {
          setLoading(false)
        }
      })()
    }
  }, [configured, tab])

  // Load KV keys when selected KV changes or prefix changes
  useEffect(() => {
    if (!configured || !selectedKv) return
    void (async () => {
      try {
        const res = await window.core.invoke('kv.keys.list', {
          namespaceId: selectedKv.id,
          prefix: kvPrefix || undefined,
        })
        setKvKeys(res.keys || [])
        setSelectedKey(null)
        setKeyValue(null)
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [selectedKv, kvPrefix])

  // Load KV value when key selected
  async function loadKeyValue(key: string) {
    if (!selectedKv) return
    setSelectedKey(key)
    setLoadingValue(true)
    try {
      const res = await window.core.invoke('kv.value.get', {
        namespaceId: selectedKv.id,
        key,
      })
      setKeyValue({ value: res.value, isJson: res.isJson })
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingValue(false)
    }
  }

  // Load R2 objects when bucket or prefix changes
  useEffect(() => {
    if (!configured || !selectedBucket) return
    void (async () => {
      try {
        const res = await window.core.invoke('r2.objects.list', {
          bucketName: selectedBucket.name,
          prefix: r2Prefix || undefined,
        })
        setR2Objects(res.objects || [])
        setSelectedObject(null)
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [selectedBucket, r2Prefix])

  // Load D1 tables when database changes
  useEffect(() => {
    if (!configured || !selectedD1) return
    void (async () => {
      try {
        const res = await window.core.invoke('d1.tables.list', {
          databaseId: selectedD1.uuid,
        })
        setD1Tables(res.tables || [])
        if (res.tables.length > 0) {
          const firstTable = res.tables[0].name
          setSelectedTable(firstTable)
          setD1Query(`SELECT * FROM ${firstTable} LIMIT 50;`)
        }
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [selectedD1])

  async function handleRunD1Query(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!selectedD1 || !d1Query.trim()) return

    setRunningQuery(true)
    setLocalError(null)
    try {
      const res = await window.core.invoke('d1.query.select', {
        databaseId: selectedD1.uuid,
        sql: d1Query.trim(),
      })
      setQueryResult(res)
      if (res.error) {
        setLocalError(res.error)
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunningQuery(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Storage & Bindings"
        subtitle="Read-only browser for Cloudflare KV Namespaces, R2 Buckets, and D1 Databases"
        busy={busy || loading}
        onRescan={onRescan}
      />

      {error && <ErrorBanner message={error} />}
      {localError && <ErrorBanner message={localError} />}

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        <button
          onClick={() => setTab('kv')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 type-nav-item transition-colors ${
            tab === 'kv'
              ? 'border-accent text-accent-strong font-medium'
              : 'border-transparent text-ink-secondary hover:text-ink'
          }`}
        >
          <IconStorage className="h-4 w-4" />
          Workers KV ({kvNamespaces.length})
        </button>
        <button
          onClick={() => setTab('r2')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 type-nav-item transition-colors ${
            tab === 'r2'
              ? 'border-accent text-accent-strong font-medium'
              : 'border-transparent text-ink-secondary hover:text-ink'
          }`}
        >
          <IconStorage className="h-4 w-4" />
          R2 Storage ({r2Buckets.length})
        </button>
        <button
          onClick={() => setTab('d1')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 type-nav-item transition-colors ${
            tab === 'd1'
              ? 'border-accent text-accent-strong font-medium'
              : 'border-transparent text-ink-secondary hover:text-ink'
          }`}
        >
          <IconStorage className="h-4 w-4" />
          D1 SQL Databases ({d1Databases.length})
        </button>
      </div>

      {/* KV Browser */}
      {tab === 'kv' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Namespaces & Keys (2 cols) */}
          <div className="space-y-4 lg:col-span-2">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedKv?.id || ''}
                onChange={(e) => {
                  const ns = kvNamespaces.find((n) => n.id === e.target.value)
                  if (ns) setSelectedKv(ns)
                }}
                className="rounded border border-border bg-surface px-3 py-1.5 type-body-sm text-ink focus:border-accent focus:outline-none"
              >
                {kvNamespaces.map((ns) => (
                  <option key={ns.id} value={ns.id}>
                    {ns.title} ({ns.id.slice(0, 8)}…)
                  </option>
                ))}
              </select>

              <div className="relative flex-1 max-w-xs">
                <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" />
                <input
                  type="text"
                  placeholder="Filter by prefix…"
                  value={kvPrefix}
                  onChange={(e) => setKvPrefix(e.target.value)}
                  className="w-full rounded border border-border bg-surface py-1.5 pl-8 pr-3 type-body-sm text-ink focus:border-accent focus:outline-none"
                />
              </div>

              <span className="type-body-sm text-ink-muted">
                {kvKeys.length} key{kvKeys.length === 1 ? '' : 's'}
              </span>
            </div>

            <Table>
              <THead>
                <tr>
                  <Th>Key Name</Th>
                  <Th>Expiration</Th>
                  <Th align="right">Action</Th>
                </tr>
              </THead>
              <TBody>
                {kvKeys.map((k) => (
                  <Tr
                    key={k.name}
                    onClick={() => void loadKeyValue(k.name)}
                    className={selectedKey === k.name ? 'bg-surface-hover' : ''}
                  >
                    <Td mono className="font-medium text-ink">
                      {k.name}
                    </Td>
                    <Td mono className="text-xs text-ink-secondary">
                      {k.expiration ? new Date(k.expiration * 1000).toLocaleString() : 'Never'}
                    </Td>
                    <Td align="right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void loadKeyValue(k.name)
                        }}
                        className="rounded border border-border px-2 py-0.5 type-code-xs text-ink-secondary hover:bg-surface-subtle hover:text-ink"
                      >
                        View Value
                      </button>
                    </Td>
                  </Tr>
                ))}
                {kvKeys.length === 0 && (
                  <EmptyRow colSpan={3}>
                    {kvNamespaces.length === 0 ? 'No KV namespaces found.' : 'No keys in this namespace.'}
                  </EmptyRow>
                )}
              </TBody>
            </Table>
          </div>

          {/* Value Preview (1 col) */}
          <div className="space-y-4">
            <div className="rounded border border-border bg-surface p-4">
              <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
                <h4 className="type-table-header text-ink-muted">Value Preview</h4>
                {keyValue?.value && (
                  <button
                    onClick={() => void handleCopy(keyValue.value || '', 'kv-val')}
                    className="flex items-center gap-1 type-code-xs text-accent-strong hover:underline"
                  >
                    {copiedKey === 'kv-val' ? <IconCheck className="h-3 w-3" /> : <IconCopy className="h-3 w-3" />}
                    Copy
                  </button>
                )}
              </div>

              {loadingValue ? (
                <p className="type-body-sm text-ink-muted">Loading value…</p>
              ) : selectedKey && keyValue ? (
                <div className="space-y-2">
                  <div className="type-code-xs font-semibold text-ink break-all">{selectedKey}</div>
                  <pre className="max-h-96 overflow-auto rounded bg-surface-subtle p-3 font-mono text-xs text-ink border border-border whitespace-pre-wrap">
                    {keyValue.isJson
                      ? JSON.stringify(JSON.parse(keyValue.value || '{}'), null, 2)
                      : keyValue.value || '<empty>'}
                  </pre>
                </div>
              ) : (
                <p className="type-body-sm text-ink-muted">Select a key to view its value.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* R2 Browser */}
      {tab === 'r2' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Objects Table (2 cols) */}
          <div className="space-y-4 lg:col-span-2">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedBucket?.name || ''}
                onChange={(e) => {
                  const b = r2Buckets.find((item) => item.name === e.target.value)
                  if (b) setSelectedBucket(b)
                }}
                className="rounded border border-border bg-surface px-3 py-1.5 type-body-sm text-ink focus:border-accent focus:outline-none"
              >
                {r2Buckets.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} ({b.location || 'default'})
                  </option>
                ))}
              </select>

              <div className="relative flex-1 max-w-xs">
                <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" />
                <input
                  type="text"
                  placeholder="Filter by prefix…"
                  value={r2Prefix}
                  onChange={(e) => setR2Prefix(e.target.value)}
                  className="w-full rounded border border-border bg-surface py-1.5 pl-8 pr-3 type-body-sm text-ink focus:border-accent focus:outline-none"
                />
              </div>

              <span className="type-body-sm text-ink-muted">
                {r2Objects.length} object{r2Objects.length === 1 ? '' : 's'}
              </span>
            </div>

            <Table>
              <THead>
                <tr>
                  <Th>Object Key</Th>
                  <Th align="right">Size</Th>
                  <Th>Uploaded</Th>
                </tr>
              </THead>
              <TBody>
                {r2Objects.map((obj) => (
                  <Tr
                    key={obj.key}
                    onClick={() => setSelectedObject(obj)}
                    className={selectedObject?.key === obj.key ? 'bg-surface-hover' : ''}
                  >
                    <Td mono className="font-medium text-ink truncate max-w-xs">
                      {obj.key}
                    </Td>
                    <Td mono align="right" className="text-xs text-ink-secondary">
                      {formatBytes(obj.size)}
                    </Td>
                    <Td mono className="text-xs text-ink-secondary">
                      {obj.uploaded ? new Date(obj.uploaded).toLocaleString() : '—'}
                    </Td>
                  </Tr>
                ))}
                {r2Objects.length === 0 && (
                  <EmptyRow colSpan={3}>
                    {r2Buckets.length === 0 ? 'No R2 buckets found.' : 'No objects in this bucket.'}
                  </EmptyRow>
                )}
              </TBody>
            </Table>
          </div>

          {/* Object Metadata (1 col) */}
          <div className="space-y-4">
            <div className="rounded border border-border bg-surface p-4">
              <h4 className="type-table-header text-ink-muted border-b border-border pb-2 mb-3">
                Object Metadata
              </h4>

              {selectedObject ? (
                <div className="space-y-3 type-body-sm">
                  <div>
                    <span className="text-ink-muted text-xs block">Key:</span>
                    <span className="font-mono text-xs font-semibold text-ink break-all">{selectedObject.key}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted text-xs block">Size:</span>
                    <span className="font-mono text-xs text-ink">{formatBytes(selectedObject.size)} ({selectedObject.size} bytes)</span>
                  </div>
                  <div>
                    <span className="text-ink-muted text-xs block">Uploaded:</span>
                    <span className="font-mono text-xs text-ink">{selectedObject.uploaded}</span>
                  </div>
                  {selectedObject.etag && (
                    <div>
                      <span className="text-ink-muted text-xs block">ETag:</span>
                      <span className="font-mono text-xs text-ink truncate block">{selectedObject.etag}</span>
                    </div>
                  )}
                  {selectedObject.httpMetadata && (
                    <div>
                      <span className="text-ink-muted text-xs block mb-1">HTTP Headers:</span>
                      <pre className="rounded bg-surface-subtle p-2 text-[11px] font-mono border border-border overflow-x-auto">
                        {JSON.stringify(selectedObject.httpMetadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <p className="type-body-sm text-ink-muted">Select an object to view its details.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* D1 SQL Browser */}
      {tab === 'd1' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-4">
            {/* Database & Tables List (1 col) */}
            <div className="space-y-4">
              <div>
                <label className="block type-table-header mb-1 text-ink-muted">Database</label>
                <select
                  value={selectedD1?.uuid || ''}
                  onChange={(e) => {
                    const db = d1Databases.find((item) => item.uuid === e.target.value)
                    if (db) setSelectedD1(db)
                  }}
                  className="w-full rounded border border-border bg-surface px-3 py-1.5 type-body-sm text-ink focus:border-accent focus:outline-none"
                >
                  {d1Databases.map((db) => (
                    <option key={db.uuid} value={db.uuid}>
                      {db.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block type-table-header mb-1.5 text-ink-muted">
                  Tables ({d1Tables.length})
                </label>
                <div className="rounded border border-border bg-surface divide-y divide-border max-h-60 overflow-y-auto">
                  {d1Tables.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => {
                        setSelectedTable(t.name)
                        setD1Query(`SELECT * FROM ${t.name} LIMIT 50;`)
                      }}
                      className={`w-full text-left px-3 py-2 type-code-xs transition-colors ${
                        selectedTable === t.name
                          ? 'bg-accent/10 text-accent-strong font-semibold'
                          : 'text-ink hover:bg-surface-hover'
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                  {d1Tables.length === 0 && (
                    <div className="p-3 type-body-sm text-ink-muted text-center">No user tables</div>
                  )}
                </div>
              </div>
            </div>

            {/* Query Runner & Results (3 cols) */}
            <div className="space-y-4 lg:col-span-3">
              <form onSubmit={handleRunD1Query} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="type-table-header text-ink-muted">Read-Only SQL Query</span>
                  <span className="type-code-xs text-ink-muted">SELECT / PRAGMA only</span>
                </div>
                <textarea
                  rows={3}
                  value={d1Query}
                  onChange={(e) => setD1Query(e.target.value)}
                  className="w-full rounded border border-border bg-surface p-3 font-mono text-xs text-ink focus:border-accent focus:outline-none"
                  placeholder="SELECT * FROM my_table LIMIT 50;"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="submit"
                    disabled={runningQuery}
                    className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 type-body-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                  >
                    <IconPlay className="h-3.5 w-3.5" />
                    {runningQuery ? 'Running…' : 'Execute Query'}
                  </button>
                </div>
              </form>

              {/* Query Result Grid */}
              {queryResult && (
                <div className="rounded border border-border bg-surface overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border bg-surface-subtle px-3 py-2 type-code-xs text-ink-muted">
                    <span>
                      {queryResult.rows.length} row{queryResult.rows.length === 1 ? '' : 's'} returned
                    </span>
                    {queryResult.durationMs !== undefined && (
                      <span>Duration: {queryResult.durationMs.toFixed(2)}ms</span>
                    )}
                  </div>

                  <div className="max-h-80 overflow-auto">
                    <Table>
                      <THead>
                        <tr>
                          {queryResult.columns.map((col) => (
                            <Th key={col}>{col}</Th>
                          ))}
                        </tr>
                      </THead>
                      <TBody>
                        {queryResult.rows.map((row, rIdx) => (
                          <Tr key={rIdx}>
                            {queryResult.columns.map((col) => (
                              <Td key={col} mono className="text-xs text-ink">
                                {typeof row[col] === 'object' && row[col] !== null
                                  ? JSON.stringify(row[col])
                                  : String(row[col] ?? 'NULL')}
                              </Td>
                            ))}
                          </Tr>
                        ))}
                        {queryResult.rows.length === 0 && (
                          <EmptyRow colSpan={Math.max(1, queryResult.columns.length)}>
                            Query returned 0 rows.
                          </EmptyRow>
                        )}
                      </TBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
