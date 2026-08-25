import { useEffect, useState } from 'react'
import type { Orphan, Resource } from '../../shared/model'
import type { RpcEvent } from '../../shared/protocol'

export default function App() {
  const [resources, setResources] = useState<Resource[]>([])
  const [orphans, setOrphans] = useState<Orphan[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => window.core.onEvent((ev: RpcEvent) => {
    if (ev.event === 'log') {
      const p = ev.payload as { source: string; line: string }
      setLogs((prev) => [...prev.slice(-200), `${p.source}  ${p.line}`])
    }
  }), [])

  async function refresh() {
    setBusy(true)
    setError(null)
    try {
      const { resources } = await window.core.invoke('discover', {})
      setResources(resources)
      const { orphans } = await window.core.invoke('orphans', undefined)
      setOrphans(orphans)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const containers = resources.filter((r) => r.type === 'container')
  const tunnels = resources.filter((r) => r.type === 'tunnel')

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <div>
          <h1 className="text-sm font-semibold tracking-tight">cloudflare-local</h1>
          <p className="text-xs text-slate-500">v0.1 — tunnels, DNS, and clean teardown</p>
        </div>
        <button
          onClick={refresh}
          disabled={busy}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          {busy ? 'Scanning…' : 'Rescan'}
        </button>
      </header>

      {error && (
        <div className="mx-6 mt-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      <main className="grid gap-6 p-6 lg:grid-cols-2">
        <Panel title="Containers" count={containers.length}>
          {containers.map((c) => (
            <Row key={c.id} name={c.name} detail={c.origins?.[0]?.address ?? '—'} state={c.meta?.state} />
          ))}
          {containers.length === 0 && <Empty>No containers found. Is Docker running?</Empty>}
        </Panel>

        <Panel title="Tunnels" count={tunnels.length}>
          {tunnels.map((t) => (
            <Row key={t.id} name={t.name} detail={`${t.routes?.length ?? 0} ingress rules`} state={t.meta?.status} />
          ))}
          {tunnels.length === 0 && <Empty>Connect a Cloudflare account to see tunnels.</Empty>}
        </Panel>

        <Panel title="Orphans" count={orphans.length}>
          {orphans.map((o, i) => (
            <div key={i} className="border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">{o.resource.name}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  o.confidence === 'certain'
                    ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                }`}>{o.confidence}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{o.reason}</p>
            </div>
          ))}
          {orphans.length === 0 && <Empty>Nothing orphaned. Account is clean.</Empty>}
        </Panel>

        <Panel title="Logs" count={logs.length}>
          <pre className="max-h-64 overflow-auto font-mono text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            {logs.join('\n') || 'No supervised processes running.'}
          </pre>
        </Panel>
      </main>
    </div>
  )
}

function Panel({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="rounded border border-slate-200 dark:border-slate-800">
      <h2 className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800">
        {title}
        <span className="font-mono">{count}</span>
      </h2>
      <div className="px-4 py-2">{children}</div>
    </section>
  )
}

function Row({ name, detail, state }: { name: string; detail: string; state?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 text-xs last:border-0 dark:border-slate-800">
      <span className="font-medium">{name}</span>
      <span className="flex items-center gap-3 text-slate-500">
        <span className="font-mono">{detail}</span>
        {state && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-800">{state}</span>}
      </span>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-xs text-slate-400">{children}</p>
}
