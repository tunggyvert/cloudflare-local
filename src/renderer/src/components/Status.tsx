export type Tone = 'healthy' | 'warning' | 'critical' | 'neutral'

const HEALTHY = /running|healthy|active|connected|ok/i
const WARNING = /pending|starting|degraded|unknown|stale/i
const CRITICAL = /error|crash|down|failed|stopped|dead/i

/** Reads a free-form provider status string into one of the system's four tones. */
export function toneFromText(text?: string): Tone {
  if (!text) return 'neutral'
  if (CRITICAL.test(text)) return 'critical'
  if (WARNING.test(text)) return 'warning'
  if (HEALTHY.test(text)) return 'healthy'
  return 'neutral'
}

const DOT_COLOR: Record<Tone, string> = {
  healthy: 'bg-status-healthy',
  warning: 'bg-status-warning',
  critical: 'bg-status-critical',
  neutral: 'bg-ink-faint',
}

export function StatusDot({ tone, className = '' }: { tone: Tone; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[tone]} ${className}`}
    />
  )
}

const PILL_STYLE: Record<Tone, string> = {
  healthy: 'border-status-healthy/40 bg-status-healthy/10 text-emerald-800',
  warning: 'border-status-warning/40 bg-status-warning/10 text-amber-800',
  critical: 'border-status-critical/40 bg-status-critical/10 text-red-800',
  neutral: 'border-border-strong bg-surface-subtle text-ink-secondary',
}

export function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`type-body-sm inline-flex items-center rounded border px-1.5 py-0.5 font-medium uppercase tracking-wide ${PILL_STYLE[tone]}`}
    >
      {children}
    </span>
  )
}
