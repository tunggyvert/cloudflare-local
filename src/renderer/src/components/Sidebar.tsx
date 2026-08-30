import {
  IconBolt,
  IconClose,
  IconContainer,
  IconDashboard,
  IconDns,
  IconLogs,
  IconOrphan,
  IconTunnel,
} from '../icons'
import type { View } from '../views/types'

const NAV: { id: View; label: string; icon: typeof IconDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: IconDashboard },
  { id: 'quick-tunnel', label: 'Quick Tunnel', icon: IconBolt },
  { id: 'containers', label: 'Containers', icon: IconContainer },
  { id: 'tunnels', label: 'Tunnels', icon: IconTunnel },
  { id: 'dns', label: 'DNS Records', icon: IconDns },
  { id: 'orphans', label: 'Orphans', icon: IconOrphan },
  { id: 'logs', label: 'Logs', icon: IconLogs },
]


export function Sidebar({
  view,
  onNavigate,
  mobileOpen,
  onCloseMobile,
  accountBadge,
}: {
  view: View
  onNavigate: (v: View) => void
  mobileOpen: boolean
  onCloseMobile: () => void
  accountBadge?: React.ReactNode
}) {
  return (
    <>
      <div
        onClick={onCloseMobile}
        aria-hidden
        className={`fixed inset-0 z-30 bg-ink/40 transition-opacity md:hidden ${
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 -translate-x-full flex-col border-r border-border bg-surface-subtle transition-transform duration-200 ease-out md:static md:w-16 md:translate-x-0 lg:w-60 ${
          mobileOpen ? 'translate-x-0' : ''
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4 md:justify-center md:px-2 lg:justify-between lg:px-4">
          <div className="md:hidden lg:block">
            <p className="type-headline-sm text-ink">cloudflare-local</p>
            <p className="type-body-sm mt-0.5 text-ink-muted">v0.1 — tunnels, DNS, clean teardown</p>
          </div>
          <div
            aria-hidden
            className="hidden h-7 w-7 items-center justify-center rounded border border-accent/40 bg-accent/10 md:flex lg:hidden"
          >
            <span className="type-nav-item text-accent-strong">C</span>
          </div>
          <button
            onClick={onCloseMobile}
            className="rounded p-1 text-ink-muted hover:bg-surface-hover md:hidden"
            aria-label="Close navigation"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {NAV.map(({ id, label, icon: ItemIcon }) => {
            const active = view === id
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                title={label}
                aria-current={active ? 'page' : undefined}
                className={`type-nav-item relative flex w-full items-center gap-3 rounded px-3 py-2 transition-colors md:justify-center md:px-0 lg:justify-start lg:px-3 ${
                  active ? 'bg-surface-hover text-ink' : 'text-ink-secondary hover:bg-surface-hover hover:text-ink'
                }`}
              >
                {active && (
                  <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" aria-hidden />
                )}
                <ItemIcon className={`h-4 w-4 shrink-0 ${active ? 'text-accent-strong' : 'text-ink-faint'}`} />
                <span className="md:hidden lg:inline">{label}</span>
              </button>
            )
          })}
        </nav>

        {accountBadge && (
          <div className="border-t border-border p-2 md:hidden lg:block">
            {accountBadge}
          </div>
        )}
      </aside>
    </>
  )
}
