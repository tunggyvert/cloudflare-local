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
      <button
        onClick={onConnect}
        className="w-full flex items-center gap-2 border border-border rounded px-3 py-2 type-body-sm text-ink-secondary hover:bg-surface-hover transition-colors"
      >
        <IconKey className="w-4 h-4" />
        Connect Account
      </button>
    )
  }

  return (
    <div className="w-full flex flex-col gap-1 border border-border rounded p-3 bg-surface">
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
  )
}
