# cloudflare-local

A local-first desktop manager for **Cloudflare Tunnels and the origins behind
them** — the containers, ports, and nginx blocks on your own machine.

> A dashboard that mirrors Cloudflare's dashboard has no reason to exist.
> A tool that owns the seam between your laptop and the edge does.

## Status

**v0.1, in progress.** The scaffold builds and the core service is verified
against real Docker. Cloudflare discovery is written but not yet wired into
onboarding.

## Why this exists

Every tool in this space is tunnel-only, server-side, or provider-shaped. None
of them can see both ends of the tunnel at once, because hops on your own
machine — the Docker socket, nginx access logs, `cloudflared`'s local metrics —
are unreachable from a web dashboard.

Two things follow from that, and they are the whole product:

**Clean teardown.** No orphaned tunnels, no stale DNS records. Even the most
popular tool in this space has an open issue for leaking exactly this.

**Path tracing** (v0.4). One timeline across edge → Worker → tunnel → nginx →
container.

## What it does today

- Reads the local Docker socket and lists containers as tunnel origins
- Discovers Cloudflare tunnels, their ingress rules, and tunnel-pointing DNS records
- **Detects orphans** — DNS pointing at deleted tunnels, tunnels nothing has
  ever connected to, ingress rules with no matching container
- Supervises `cloudflared` with real logs, health, backoff, and graceful stop
- Runs in the tray with the window closed; kills every child process on quit
- Stores scoped API tokens in the OS keychain, and refuses Global API Keys

## What it deliberately does not do

Billing, analytics, WAF, page rules, email routing, Workers/KV/R2/D1
management, Kubernetes. Cloudflare's dashboard is better at all of them.

**It does not write to your account.** `apply()` throws until the plan/diff gate
lands in v0.5. Reads, local process supervision, and orphan *detection* are the
v0.1 surface.

## Requirements

Node 22+ · pnpm · Docker (for the Docker provider) · `cloudflared` on `PATH`
(for tunnel supervision)

## Development

```bash
pnpm install
pnpm dev        # electron-vite dev with HMR
pnpm typecheck
pnpm build
pnpm start      # preview the production build
pnpm dist       # package installers
```

### Gotchas

- **`node-linker=hoisted` is required** (committed in `.npmrc`) — electron-builder
  cannot resolve pnpm's symlinked store.
- **pnpm blocks install scripts by default.** `electron` needs its script to
  download the binary. If you see `Error: Electron uninstall`, run
  `node node_modules/electron/install.js`.
- The package is ESM (`"type": "module"`), so build output is `.js` and
  `__dirname` does not exist — use `import.meta.dirname`.

## Architecture

```
src/
  main/       Electron: window, tray, IPC bridge
    core-client.ts   the only file that knows how the core is reached
  core/       the service — NEVER imports from 'electron'
    providers/       docker.ts, cloudflare.ts, types.ts (the 6-method seam)
    supervisor/      real process supervision, graceful teardown
    orphans.ts       the v0.1 headline
    secrets.ts       OS keychain, rejects Global API Keys
  preload/    contextBridge: invoke a core method, subscribe to events
  renderer/   React + Tailwind
  shared/     model.ts (canonical types), protocol.ts (the wire contract)
```

**The rule:** `src/core/**` must never import from `electron`. It runs as a
forked child today and is designed to be promoted to a launchd/systemd/Windows
service later without moving any logic. One `import { app } from 'electron'` and
that path is gone.

## License

MIT
