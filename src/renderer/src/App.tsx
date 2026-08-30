import { useEffect, useState } from 'react'
import type { Orphan, Resource } from '../../shared/model'
import type { RpcEvent } from '../../shared/protocol'
import { AccountBadge } from './components/AccountBadge'
import { OnboardingModal } from './components/OnboardingModal'
import { Sidebar } from './components/Sidebar'
import { IconMenu } from './icons'
import { ContainersView } from './views/ContainersView'
import { DashboardView } from './views/DashboardView'
import { DnsView } from './views/DnsView'
import type { LogEntry } from './views/LogsView'
import { LogsView } from './views/LogsView'
import { OrphansView } from './views/OrphansView'
import { TunnelsView } from './views/TunnelsView'
import type { View } from './views/types'

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)

  const [resources, setResources] = useState<Resource[]>([])
  const [orphans, setOrphans] = useState<Orphan[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Account state
  const [configured, setConfigured] = useState<boolean | null>(null) // null = loading
  const [accountLabel, setAccountLabel] = useState<string | undefined>()
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(
    () =>
      window.core.onEvent((ev: RpcEvent) => {
        if (ev.event === 'log') {
          const entry = ev.payload as LogEntry
          setLogs((prev) => [...prev.slice(-200), entry])
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

  const containers = resources.filter((r) => r.type === 'container')
  const tunnels = resources.filter((r) => r.type === 'tunnel')
  const dnsRecords = resources.filter((r) => r.type === 'dns_record')

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
              orphans={orphans}
              logs={logs}
              busy={busy}
              error={error}
              configured={configured}
              onRescan={refresh}
              onNavigate={navigate}
              onConnect={() => setShowOnboarding(true)}
            />
          )}
          {view === 'containers' && (
            <ContainersView containers={containers} busy={busy} error={error} onRescan={refresh} />
          )}
          {view === 'tunnels' && <TunnelsView tunnels={tunnels} busy={busy} error={error} onRescan={refresh} />}
          {view === 'dns' && <DnsView dnsRecords={dnsRecords} tunnels={tunnels} busy={busy} error={error} onRescan={refresh} />}
          {view === 'orphans' && <OrphansView orphans={orphans} busy={busy} error={error} onRescan={refresh} />}
          {view === 'logs' && <LogsView logs={logs} busy={busy} error={error} onRescan={refresh} />}
        </main>
      </div>

      <OnboardingModal open={showOnboarding} onConnected={handleConnected} />
    </div>
  )
}
