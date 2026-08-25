import type { Change, Orphan, Resource } from '../shared/model'

/**
 * Orphan detection — the reason this app exists.
 *
 * Every competing tool leaks Cloudflare resources. DockFlare, the most popular
 * one (2.4k stars), has an open issue for exactly this: "Removing an agent does
 * not clean up its Cloudflare Tunnel or stop the managed cloudflared container."
 * Nothing on the market audits an account for the debris that tunnel workflows
 * leave behind.
 *
 * Detection is deliberately conservative. Only `certain` orphans are offered for
 * bulk cleanup; `likely` ones are shown but must be selected individually,
 * because a false positive here deletes someone's production DNS record.
 */
export function detectOrphans(resources: Resource[]): Orphan[] {
  const orphans: Orphan[] = []

  const tunnels = resources.filter((r) => r.type === 'tunnel')
  const dnsRecords = resources.filter((r) => r.type === 'dns_record')
  const containers = resources.filter((r) => r.type === 'container')

  const tunnelIds = new Set(
    tunnels.map((t) => t.meta?.tunnelId).filter((id): id is string => Boolean(id)),
  )

  /* 1. DNS record pointing at a tunnel that no longer exists.
     Certain: the CNAME target is a tunnel UUID and no such tunnel is in the
     account. The hostname is dead — it cannot resolve to anything. */
  for (const rec of dnsRecords) {
    const target = rec.meta?.pointsAtTunnel
    if (!target || tunnelIds.has(target)) continue

    orphans.push({
      resource: rec,
      reason: `CNAME points at tunnel ${target}, which no longer exists in this account. This hostname cannot resolve.`,
      confidence: 'certain',
      cleanup: deleteChange(rec, 'dns_record', `Delete DNS record ${rec.name}`, [
        { path: 'zoneId', before: rec.meta?.zoneId ?? null, after: null },
        { path: 'recordId', before: rec.meta?.recordId ?? null, after: null },
      ]),
    })
  }

  /* 2. Tunnel that has never had a connection.
     Likely, not certain: a tunnel created minutes ago by a workflow that has
     not started cloudflared yet looks identical to abandoned debris. Age is the
     discriminator — we only flag ones older than a day. */
  for (const t of tunnels) {
    const status = t.meta?.status
    const conns = Number(t.meta?.connections ?? '0')
    if (status !== 'inactive' && conns > 0) continue

    const createdAt = t.meta?.createdAt ? Date.parse(t.meta.createdAt) : NaN
    const ageDays = Number.isNaN(createdAt) ? Infinity : (Date.now() - createdAt) / 86_400_000
    if (ageDays < 1) continue

    orphans.push({
      resource: t,
      reason: `No cloudflared has connected in ${Math.floor(ageDays)} days and the tunnel has no active connections.`,
      confidence: 'likely',
      cleanup: deleteChange(t, 'tunnel', `Delete tunnel ${t.name}`, [
        { path: 'tunnelId', before: t.meta?.tunnelId ?? null, after: null },
      ]),
    })
  }

  /* 3. Ingress rule whose origin container is gone.
     Likely: the container may simply be stopped rather than deleted, and the
     rule is still correct. We surface it as a warning, never a bulk delete. */
  const liveAddresses = new Set(
    containers.flatMap((c) => c.origins ?? []).map((o) => o.address),
  )

  for (const t of tunnels) {
    for (const route of t.routes ?? []) {
      const service = route.originId
      if (!service || liveAddresses.has(service)) continue

      orphans.push({
        resource: t,
        reason: `Ingress rule for ${route.hostname} forwards to ${service}, which matches no running container.`,
        confidence: 'likely',
        cleanup: deleteChange(t, 'tunnel_ingress', `Remove ingress rule for ${route.hostname}`, [
          { path: 'hostname', before: route.hostname, after: null },
        ]),
      })
    }
  }

  return orphans
}

function deleteChange(
  resource: Resource,
  resourceType: string,
  summary: string,
  fields: Change['fields'],
): Change {
  return {
    id: `cleanup:${resource.id}`,
    provider: resource.provider,
    action: 'delete',
    resourceType,
    resourceName: resource.name,
    summary,
    fields,
    // Tunnel deletion loses credentials; DNS deletion is recoverable but
    // user-visible. Both are worth an explicit confirmation.
    destructive: true,
  }
}
