import { IconRefresh } from '../icons'

export function PageHeader({
  title,
  subtitle,
  busy,
  onRescan,
  children,
}: {
  title: string
  subtitle?: string
  busy: boolean
  onRescan: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <div>
        <h1 className="type-headline-sm text-ink">{title}</h1>
        {subtitle && <p className="type-body-sm mt-0.5 text-ink-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {children}
        <button
          onClick={onRescan}
          disabled={busy}
          className="type-nav-item inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconRefresh className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          {busy ? 'Scanning…' : 'Rescan'}
        </button>
      </div>
    </div>
  )
}
