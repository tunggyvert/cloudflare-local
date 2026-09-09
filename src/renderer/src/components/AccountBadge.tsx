import { IconKey } from '../icons'
import { StatusDot } from './Status'

interface AccountBadgeProps {
  configured: boolean
  label?: string
  onConnect: () => void
  onDisconnect: () => void
}

export function AccountBadge({ configured, label, onConnect, onDisconnect }: AccountBadgeProps) {
  if (!configured) {
    return (
      <>
        {/* Full width (mobile drawer + desktop) */}
        <button
          onClick={onConnect}
          className="w-full flex md:hidden lg:flex items-center gap-2 border border-border rounded px-3 py-2 type-body-sm text-ink-secondary hover:bg-surface-hover transition-colors"
        >
          <IconKey className="w-4 h-4 shrink-0" />
          <span>Connect Account</span>
        </button>

        {/* Collapsed (tablet md icon sidebar) */}
        <button
          onClick={onConnect}
          title="Connect Cloudflare Account"
          className="w-full hidden md:flex lg:hidden items-center justify-center p-2 rounded border border-border text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors"
          aria-label="Connect Account"
        >
          <IconKey className="w-4 h-4" />
        </button>
      </>
    )
  }

  return (
    <>
      {/* Full width (mobile drawer + desktop) */}
      <div className="w-full flex md:hidden lg:flex flex-col gap-1 border border-border rounded p-3 bg-surface">
        <div className="flex items-center gap-2">
          <StatusDot tone="healthy" />
          <span className="type-body-sm font-medium text-ink truncate">
            {label || 'Cloudflare Account'}
          </span>
        </div>
        <div className="flex items-center gap-2 pl-4">
          <button
            onClick={onDisconnect}
            className="type-body-sm text-ink-muted hover:text-red-600 cursor-pointer transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Collapsed (tablet md icon sidebar) */}
      <div className="w-full hidden md:flex lg:hidden items-center justify-center p-1.5 rounded border border-border bg-surface">
        <button
          onClick={onDisconnect}
          className="relative flex items-center justify-center p-1 text-ink-muted hover:text-red-600 transition-colors"
          title={`${label || 'Cloudflare Account'} (Connected) — Click to disconnect`}
          aria-label="Disconnect account"
        >
          <IconKey className="w-4 h-4 text-accent-strong" />
          <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-status-healthy ring-1 ring-surface" />
        </button>
      </div>
    </>
  )
}
