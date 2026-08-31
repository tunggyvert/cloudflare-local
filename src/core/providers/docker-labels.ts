/**
 * DockFlare label parser and normalizer.
 *
 * Supports DockFlare-style labels (`cloudflare.*`, `dockflare.*`, `cloudflare-local.*`)
 * without requiring them. Containers can declare their desired public hostname, target tunnel,
 * origin service/port, path routing, and options directly via Docker labels.
 */

export interface DockFlareConfig {
  enabled: boolean
  hostname?: string
  tunnel?: string
  service?: string
  port?: number
  path?: string
  noTlsVerify?: boolean
  raw: Record<string, string>
}

/** Prefix keys supported for label declaration */
const PREFIXES = ['cloudflare.', 'cloudflare-local.', 'dockflare.']

/**
 * Extracts and normalizes DockFlare configuration from container labels.
 * Returns null if no recognized labels are present.
 */
export function parseDockFlareLabels(labels: Record<string, string> = {}): DockFlareConfig | null {
  const raw: Record<string, string> = {}
  let hasAny = false

  for (const [key, val] of Object.entries(labels)) {
    const matchedPrefix = PREFIXES.find((p) => key.startsWith(p))
    if (matchedPrefix) {
      hasAny = true
      raw[key] = val
    }
  }

  if (!hasAny) return null

  // Lookup helper matching any recognized prefix
  function getVal(...suffixes: string[]): string | undefined {
    for (const suffix of suffixes) {
      for (const prefix of PREFIXES) {
        const fullKey = `${prefix}${suffix}`
        if (raw[fullKey] !== undefined && raw[fullKey].trim() !== '') {
          return raw[fullKey].trim()
        }
      }
    }
    return undefined
  }

  // 1. Check enabled flag (defaults to true if labels exist, unless explicitly disabled)
  const enabledStr = getVal('enabled', 'enable')
  const enabled =
    enabledStr !== undefined
      ? !['false', '0', 'no', 'disable', 'disabled'].includes(enabledStr.toLowerCase())
      : true

  // 2. Hostname
  const hostname = getVal('hostname', 'host', 'domain')

  // 3. Target Tunnel
  const tunnel = getVal('tunnel', 'tunnel_id', 'tunnel-id', 'tunnel_name', 'tunnel-name')

  // 4. Path routing
  const path = getVal('path')

  // 5. Port / Service
  const portStr = getVal('port', 'target_port', 'target-port')
  const port = portStr && !Number.isNaN(Number(portStr)) ? Number(portStr) : undefined

  let service = getVal('service', 'origin', 'target')
  if (!service && port) {
    service = `http://localhost:${port}`
  } else if (service && /^\d+$/.test(service)) {
    service = `http://localhost:${service}`
  }

  // 6. Options
  const noTlsVerifyStr = getVal('no_tls_verify', 'no-tls-verify', 'insecure')
  const noTlsVerify =
    noTlsVerifyStr !== undefined
      ? ['true', '1', 'yes'].includes(noTlsVerifyStr.toLowerCase())
      : undefined

  return {
    enabled,
    hostname,
    tunnel,
    service,
    port,
    path,
    noTlsVerify,
    raw,
  }
}
