import { useEffect, useState } from 'react'
import type { ExplorerTrace, Orphan, QuickTunnel, Resource, WorkerTailEvent } from '../../shared/model'
import type { RpcEvent } from '../../shared/protocol'
import { AccountBadge } from './components/AccountBadge'
import { ExposeContainerModal } from './components/ExposeContainerModal'
import { OnboardingModal } from './components/OnboardingModal'
import { Sidebar } from './components/Sidebar'
import { IconMenu } from './icons'
import { BindingsView } from './views/BindingsView'
import { ContainersView } from './views/ContainersView'
import { DashboardView } from './views/DashboardView'
import { DnsView } from './views/DnsView'
import { ExplorerView } from './views/ExplorerView'
import type { LogEntry } from './views/LogsView'
import { LogsView } from './views/LogsView'
import { NginxView } from './views/NginxView'
import { OrphansView } from './views/OrphansView'
import { QuickTunnelView } from './views/QuickTunnelView'
import { TunnelsView } from './views/TunnelsView'
import type { View } from './views/types'
import { WorkersView } from './views/WorkersView'

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)

  const [resources, setResources] = useState<Resource[]>([])
  const [orphans, setOrphans] = useState<Orphan[]>([])
  const [quickTunnels, setQuickTunnels] = useState<QuickTunnel[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [traces, setTraces] = useState<ExplorerTrace[]>([])
  const [tailLogs, setTailLogs] = useState<WorkerTailEvent[]>([])
  const [activeTailScript, setActiveTailScript] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Account state
  const [configured, setConfigured] = useState<boolean | null>(null) // null = loading
  const [accountLabel, setAccountLabel] = useState<string | undefined>()
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Container expose modal state
  const [exposeModalOpen, setExposeModalOpen] = useState(false)
  const [selectedContainerForExpose, setSelectedContainerForExpose] = useState<Resource | null>(null)

  useEffect(
    () =>
      window.core.onEvent((ev: RpcEvent) => {
        if (ev.event === 'log') {
          const entry = ev.payload as LogEntry
          setLogs((prev) => [...prev.slice(-200), entry])
        } else if (ev.event === 'quickTunnel') {
          const { tunnel } = ev.payload as { tunnel: QuickTunnel }
          setQuickTunnels((prev) => {
            const idx = prev.findIndex((t) => t.id === tunnel.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = tunnel
              return next
            }
            return [...prev, tunnel]
          })
        } else if (ev.event === 'workerTail') {
          const { event } = ev.payload as { scriptName: string; event: WorkerTailEvent }
          setTailLogs((prev) => [...prev.slice(-300), event])
        } else if (ev.event === 'explorerTrace') {
          const { trace } = ev.payload as { trace: ExplorerTrace }
          setTraces((prev) => [trace, ...prev.slice(0, 299)])
        } else if (ev.event === 'nginx') {
          const nEvent = ev.payload as { event: string; path?: string; detail?: string }
          setLogs((prev) => [
            ...prev.slice(-200),
            {
              source: 'nginx',
              stream: 'stdout',
              line: nEvent.detail || `nginx config ${nEvent.event}`,
              at: new Date().toISOString(),
            },
          ])
          void refresh()
        } else if (ev.event === 'container') {
          const cEvent = ev.payload as { action: string; name?: string; at: string }
          setLogs((prev) => [
            ...prev.slice(-200),
            {
              source: 'docker',
              stream: 'stdout',
              line: `container ${cEvent.name ? `"${cEvent.name}"` : ''} ${cEvent.action}`,
              at: cEvent.at,
            },
          ])
          void (async () => {
            try {
              const { resources } = await window.core.invoke('discover', {})
              setResources(resources)
              const { orphans } = await window.core.invoke('orphans', undefined)
              setOrphans(orphans)
            } catch {
              /* ignore */
            }
          })()
        } else if (ev.event === 'discovered') {
          void (async () => {
            try {
              const { orphans } = await window.core.invoke('orphans', undefined)
              setOrphans(orphans)
            } catch {
              /* ignore */
            }
          })()
        }
      }),
    [],
  )

  /** Check if a Cloudflare account is configured on mount. */
  useEffect(() => {
    void checkAccount()
  }, [])

  async function checkAccount() {
    try {
      const status = await window.core.invoke('account.status', undefined)
      setConfigured(status.configured)
      setAccountLabel(status.label)
      if (!status.configured) {
        setShowOnboarding(true)
      }
    } catch {
      setConfigured(false)
    }
  }

  async function refresh() {
    setBusy(true)
    setError(null)
    try {
      const { resources } = await window.core.invoke('discover', {})
      setResources(resources)
      const { orphans } = await window.core.invoke('orphans', undefined)
      setOrphans(orphans)
      const { tunnels } = await window.core.invoke('quickTunnel.list', undefined)
      setQuickTunnels(tunnels)
      const { traces: recentTraces } = await window.core.invoke('explorer.traces.list', { limit: 100 })
      setTraces(recentTraces || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  function navigate(next: View) {
    setView(next)
    setMobileOpen(false)
  }

  async function handleConnected() {
    setShowOnboarding(false)
    await checkAccount()
    await refresh()
  }

  async function handleDisconnect() {
    await window.core.invoke('account.remove', undefined)
    setConfigured(false)
    setAccountLabel(undefined)
    await refresh()
  }

  async function handleStartQuickTunnel(targetUrl: string) {
    const { tunnel } = await window.core.invoke('quickTunnel.start', { targetUrl })
    setQuickTunnels((prev) => {
      const idx = prev.findIndex((t) => t.id === tunnel.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = tunnel
        return next
      }
      return [...prev, tunnel]
    })
  }

  async function handleStopQuickTunnel(id: string) {
    await window.core.invoke('quickTunnel.stop', { id })
  }

  async function handleExposeContainer(originAddress: string) {
    await handleStartQuickTunnel(originAddress)
    navigate('quick-tunnel')
  }

  function handleOpenExposeModal(container: Resource) {
    setSelectedContainerForExpose(container)
    setExposeModalOpen(true)
  }

  async function handleStartTail(scriptName: string) {
    try {
      await window.core.invoke('worker.tail.start', { scriptName })
      setActiveTailScript(scriptName)
      setTailLogs([])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleStopTail(scriptName: string) {
    try {
      await window.core.invoke('worker.tail.stop', { scriptName })
      setActiveTailScript(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleClearTraces() {
    try {
      await window.core.invoke('explorer.traces.clear', undefined)
      setTraces([])
    } catch {
      /* ignore */
    }
  }

  const containers = resources.filter((r) => r.type === 'container')
  const tunnels = resources.filter((r) => r.type === 'tunnel')
  const dnsRecords = resources.filter((r) => r.type === 'dns_record')
  const workers = resources.filter((r) => r.type === 'worker')
  const nginxServers = resources.filter((r) => r.type === 'nginx_server')

  // Don't render until we know account status
  if (configured === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-subtle">
        <p className="type-body-sm text-ink-muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-surface-subtle">
      <Sidebar
        view={view}
        onNavigate={navigate}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        accountBadge={
          <AccountBadge
            configured={configured}
            label={accountLabel}
            onConnect={() => setShowOnboarding(true)}
            onDisconnect={handleDisconnect}
          />
        }
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded p-1 text-ink-muted hover:bg-surface-hover"
            aria-label="Open navigation"
          >
            <IconMenu className="h-4 w-4" />
          </button>
          <span className="type-headline-sm text-ink">cloudflare-local</span>
        </div>

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 lg:p-6">
          {view === 'dashboard' && (
            <DashboardView
              containers={containers}
              tunnels={tunnels}
              dnsRecords={dnsRecords}
              workers={workers}
              nginxServers={nginxServers}
              orphans={orphans}
              quickTunnels={quickTunnels}
              logs={logs}
              tracesCount={traces.length}
              busy={busy}
              error={error}
              configured={configured}
              onRescan={refresh}
              onNavigate={navigate}
              onConnect={() => setShowOnboarding(true)}
            />
          )}
          {view === 'quick-tunnel' && (
            <QuickTunnelView
              quickTunnels={quickTunnels}
              containers={containers}
              logs={logs}
              busy={busy}
              error={error}
              onStart={handleStartQuickTunnel}
              onStop={handleStopQuickTunnel}
              onRescan={refresh}
            />
          )}
          {view === 'containers' && (
            <ContainersView
              containers={containers}
              busy={busy}
              error={error}
              onRescan={refresh}
              onStartQuickTunnel={handleExposeContainer}
              onExposeContainer={handleOpenExposeModal}
            />
          )}
          {view === 'tunnels' && <TunnelsView tunnels={tunnels} busy={busy} error={error} onRescan={refresh} />}
          {view === 'dns' && <DnsView dnsRecords={dnsRecords} tunnels={tunnels} busy={busy} error={error} onRescan={refresh} />}
          {view === 'workers' && (
            <WorkersView
              busy={busy}
              error={error}
              configured={configured}
              onRescan={refresh}
              tailLogs={tailLogs}
              activeTailScript={activeTailScript}
              onStartTail={handleStartTail}
              onStopTail={handleStopTail}
            />
          )}
          {view === 'bindings' && (
            <BindingsView
              busy={busy}
              error={error}
              configured={configured}
              onRescan={refresh}
            />
          )}
          {view === 'explorer' && (
            <ExplorerView
              traces={traces}
              busy={busy}
              error={error}
              onRescan={refresh}
              onClearTraces={handleClearTraces}
            />
          )}
          {view === 'nginx' && (
            <NginxView
              nginxResources={nginxServers}
              busy={busy}
              error={error}
              onRescan={refresh}
            />
          )}
          {view === 'orphans' && <OrphansView orphans={orphans} busy={busy} error={error} onRescan={refresh} />}
          {view === 'logs' && <LogsView logs={logs} busy={busy} error={error} onRescan={refresh} />}
        </main>
      </div>

      <OnboardingModal open={showOnboarding} onConnected={handleConnected} />
      <ExposeContainerModal
        container={selectedContainerForExpose}
        tunnels={tunnels}
        open={exposeModalOpen}
        onClose={() => setExposeModalOpen(false)}
        onExposed={refresh}
      />
    </div>
  )
}

