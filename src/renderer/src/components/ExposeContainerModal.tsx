import { useEffect, useState } from 'react'
import type { Resource } from '../../../shared/model'
import { IconBolt, IconCheck, IconClose, IconDns, IconLink, IconTunnel } from '../icons'
import { StatusDot, StatusPill, toneFromText } from './Status'

interface ExposeContainerModalProps {
  container: Resource | null
  tunnels: Resource[]
  open: boolean
  onClose: () => void
  onExposed: () => void
}

interface ZoneOption {
  id: string
  name: string
}

export function ExposeContainerModal({
  container,
  tunnels,
  open,
  onClose,
  onExposed,
}: ExposeContainerModalProps) {
  const [zones, setZones] = useState<ZoneOption[]>([])
  const [loadingZones, setLoadingZones] = useState(false)
  const [selectedTunnelId, setSelectedTunnelId] = useState<string>('')
  const [selectedZoneId, setSelectedZoneId] = useState<string>('')
  const [subdomain, setSubdomain] = useState<string>('')
  const [originService, setOriginService] = useState<string>('')
  const [path, setPath] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Pre-fill state when container changes or modal opens
  useEffect(() => {
    if (!open || !container) return

    setError(null)
    setSuccess(null)

    // 1. Determine origin address default (prefer dockflare_service / port if present)
    const labelService = container.meta?.['dockflare_service'] || container.meta?.['cloudflare.service']
    const defaultOrigin = labelService ?? container.origins?.[0]?.address ?? 'http://localhost:8080'
    setOriginService(defaultOrigin)

    // 2. Determine default tunnel
    const labelTunnel = container.meta?.['dockflare_tunnel'] || container.meta?.['cloudflare.tunnel']
    const matchingTunnel = tunnels.find(
      (t) => t.id === labelTunnel || t.name === labelTunnel || t.meta?.tunnelId === labelTunnel
    )
    if (matchingTunnel?.meta?.tunnelId) {
      setSelectedTunnelId(matchingTunnel.meta.tunnelId)
    } else if (tunnels.length > 0 && tunnels[0].meta?.tunnelId) {
      setSelectedTunnelId(tunnels[0].meta.tunnelId)
    } else {
      setSelectedTunnelId('')
    }

    // 3. Path routing
    const labelPath = container.meta?.['dockflare_path'] || container.meta?.['cloudflare.path'] || ''
    setPath(labelPath)

    // 4. Check for dockflare label for hostname
    const labelHostname = container.meta?.['dockflare_hostname'] || container.meta?.['cloudflare.hostname']
    if (labelHostname) {
      const parts = labelHostname.split('.')
      if (parts.length > 2) {
        setSubdomain(parts[0])
      } else {
        setSubdomain(parts[0] ?? container.name)
      }
    } else {
      // Default subdomain to sanitized container name
      const sanitizedName = container.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      setSubdomain(sanitizedName)
    }

    // Fetch zones from Cloudflare
    void loadZones(labelHostname)
  }, [open, container, tunnels])

  async function loadZones(prefillHostname?: string) {
    setLoadingZones(true)
    try {
      const res = await window.core.invoke('zones.list', undefined)
      setZones(res.zones)
      if (res.zones.length > 0) {
        if (prefillHostname) {
          const matchedZone = res.zones.find(
            (z) => prefillHostname === z.name || prefillHostname.endsWith(`.${z.name}`)
          )
          if (matchedZone) {
            setSelectedZoneId(matchedZone.id)
            if (prefillHostname !== matchedZone.name) {
              const sub = prefillHostname.slice(0, prefillHostname.length - matchedZone.name.length - 1)
              setSubdomain(sub)
            } else {
              setSubdomain('@')
            }
            return
          }
        }
        setSelectedZoneId(res.zones[0].id)
      }
    } catch {
      // ignore
    } finally {
      setLoadingZones(false)
    }
  }

  if (!open || !container) return null

  const selectedZone = zones.find((z) => z.id === selectedZoneId)
  const fullHostname =
    selectedZone
      ? subdomain.trim() === '@' || !subdomain.trim()
        ? selectedZone.name
        : `${subdomain.trim().toLowerCase()}.${selectedZone.name}`
      : subdomain.trim().toLowerCase()

  const selectedTunnel = tunnels.find((t) => t.meta?.tunnelId === selectedTunnelId)
  const labelHostname = container.meta?.['dockflare_hostname'] || container.meta?.['cloudflare.hostname']
  const labelTunnel = container.meta?.['dockflare_tunnel'] || container.meta?.['cloudflare.tunnel']
  const labelService = container.meta?.['dockflare_service'] || container.meta?.['cloudflare.service']
  const labelPath = container.meta?.['dockflare_path'] || container.meta?.['cloudflare.path']
  const hasLabels = Boolean(
    labelHostname || labelTunnel || labelService || labelPath || container.meta?.['dockflare_enabled']
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTunnelId) {
      setError('Please select a target Cloudflare Tunnel')
      return
    }
    if (!fullHostname) {
      setError('Hostname is required')
      return
    }
    if (!originService) {
      setError('Origin service address is required')
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await window.core.invoke('container.expose', {
        tunnelId: selectedTunnelId,
        hostname: fullHostname,
        service: originService,
        path: path.trim() || undefined,
        zoneId: selectedZoneId || undefined,
      })

      if (res.ok) {
        setSuccess(`Successfully exposed at https://${fullHostname}`)
        setTimeout(() => {
          onExposed()
          onClose()
        }, 1200)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded border border-border bg-surface shadow-md">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-accent/10 text-accent-strong">
              <IconLink className="h-4 w-4" />
            </div>
            <div>
              <h2 className="type-headline-sm text-ink">Expose Container at Hostname</h2>
              <p className="type-body-sm text-ink-muted">
                Configure Cloudflare Tunnel ingress & DNS CNAME in one step
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-ink-muted hover:bg-surface-hover hover:text-ink disabled:opacity-50"
            aria-label="Close"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Target Container Banner */}
          <div className="flex items-center justify-between rounded border border-border bg-surface-subtle px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <StatusDot tone={toneFromText(container.meta?.state)} />
              <span className="type-body-sm font-semibold text-ink">{container.name}</span>
              {container.meta?.state && (
                <StatusPill tone={toneFromText(container.meta.state)}>{container.meta.state}</StatusPill>
              )}
            </div>
            <span className="type-code-sm text-ink-muted truncate max-w-[200px]">
              {container.meta?.image}
            </span>
          </div>

          {/* DockFlare Label Banner if present */}
          {hasLabels && (
            <div className="rounded border border-accent/30 bg-accent/5 p-3 space-y-1.5 type-body-sm text-ink">
              <div className="flex items-center gap-1.5 font-medium text-accent-strong">
                <IconBolt className="h-4 w-4 shrink-0" />
                <span>Detected DockFlare labels</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 type-code-sm text-ink-secondary text-[11px]">
                {labelHostname && <div>hostname: <strong className="text-ink">{labelHostname}</strong></div>}
                {labelTunnel && <div>tunnel: <strong className="text-ink">{labelTunnel}</strong></div>}
                {labelService && <div>service: <strong className="text-ink">{labelService}</strong></div>}
                {labelPath && <div>path: <strong className="text-ink">{labelPath}</strong></div>}
              </div>
            </div>
          )}

          {/* Cloudflare Tunnel Selector */}
          <div>
            <label className="block type-body-sm font-medium text-ink mb-1">
              Target Cloudflare Tunnel
            </label>
            {tunnels.length === 0 ? (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 type-body-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                No Cloudflare Tunnels found on your account. Create a tunnel first or use TryCloudflare Quick Tunnel.
              </div>
            ) : (
              <select
                value={selectedTunnelId}
                onChange={(e) => setSelectedTunnelId(e.target.value)}
                disabled={busy}
                className="w-full rounded border border-border bg-surface px-3 py-2 type-body-sm text-ink focus:border-accent focus:outline-none"
              >
                {tunnels.map((t) => (
                  <option key={t.id} value={t.meta?.tunnelId ?? t.id}>
                    {t.name} ({t.meta?.status ?? 'active'} · {t.meta?.tunnelId?.slice(0, 8)}…)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Hostname & Zone Configuration */}
          <div>
            <label className="block type-body-sm font-medium text-ink mb-1">Public Hostname</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value)}
                  placeholder="e.g. api, app, or @"
                  disabled={busy}
                  className="w-full rounded border border-border bg-surface px-3 py-2 type-code-sm text-ink focus:border-accent focus:outline-none"
                />
              </div>
              <div className="w-1/2">
                <select
                  value={selectedZoneId}
                  onChange={(e) => setSelectedZoneId(e.target.value)}
                  disabled={busy || loadingZones}
                  className="w-full rounded border border-border bg-surface px-3 py-2 type-code-sm text-ink focus:border-accent focus:outline-none"
                >
                  {zones.length === 0 ? (
                    <option value="">{loadingZones ? 'Loading zones…' : 'No zones available'}</option>
                  ) : (
                    zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        .{z.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
            {fullHostname && (
              <p className="mt-1.5 type-body-sm text-ink-muted">
                Public URL:{' '}
                <span className="font-mono font-medium text-accent-strong">
                  https://{fullHostname}
                </span>
              </p>
            )}
          </div>

          {/* Origin Service URL */}
          <div>
            <label className="block type-body-sm font-medium text-ink mb-1">Origin Service Address</label>
            <div className="space-y-1.5">
              <input
                type="text"
                value={originService}
                onChange={(e) => setOriginService(e.target.value)}
                placeholder="http://localhost:3000"
                disabled={busy}
                className="w-full rounded border border-border bg-surface px-3 py-2 type-code-sm text-ink focus:border-accent focus:outline-none"
              />
              {container.origins && container.origins.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="type-body-sm text-ink-muted mr-1">Suggestions:</span>
                  {container.origins.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setOriginService(o.address)}
                      className="rounded border border-border bg-surface-subtle px-2 py-0.5 type-code-sm text-ink hover:border-accent hover:text-accent transition-colors"
                    >
                      {o.address}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Path (Optional) */}
          <div>
            <label className="block type-body-sm font-medium text-ink mb-1">
              Path Routing <span className="text-ink-muted font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="e.g. /api/* or leave blank for root"
              disabled={busy}
              className="w-full rounded border border-border bg-surface px-3 py-2 type-code-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          {/* Plan Summary Preview */}
          <div className="rounded border border-border bg-surface-subtle p-3 space-y-1.5">
            <div className="type-table-header text-ink-muted">Action Preview</div>
            <div className="flex items-center gap-2 type-code-sm text-ink-secondary">
              <IconTunnel className="h-3.5 w-3.5 text-ink-faint shrink-0" />
              <span>
                Tunnel Ingress: <strong className="text-ink">{fullHostname || '—'}</strong> →{' '}
                <strong className="text-ink">{originService || '—'}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 type-code-sm text-ink-secondary">
              <IconDns className="h-3.5 w-3.5 text-ink-faint shrink-0" />
              <span>
                DNS CNAME: <strong className="text-ink">{fullHostname || '—'}</strong> →{' '}
                <strong className="text-ink">
                  {selectedTunnel?.meta?.tunnelId
                    ? `${selectedTunnel.meta.tunnelId.slice(0, 8)}….cfargotunnel.com`
                    : '<tunnel-id>.cfargotunnel.com'}
                </strong>{' '}
                (Proxied)
              </span>
            </div>
          </div>

          {/* Errors / Success alerts */}
          {error && (
            <div className="rounded border border-red-300 bg-red-50 p-3 type-body-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded border border-green-300 bg-green-50 p-3 type-body-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
              <IconCheck className="h-4 w-4 shrink-0 text-green-600" />
              <span>{success}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded border border-border px-4 py-2 type-body-sm font-medium text-ink hover:bg-surface-hover disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !selectedTunnelId || !fullHostname || !originService || tunnels.length === 0}
              className="inline-flex items-center gap-1.5 rounded bg-accent px-4 py-2 type-body-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 transition-colors shadow-xs"
            >
              {busy ? 'Exposing…' : 'Expose Container'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
