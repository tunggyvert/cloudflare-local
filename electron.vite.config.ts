import { resolve } from 'node:path'
import { builtinModules } from 'node:module'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

/**
 * Runtime dependencies are never bundled. dockerode, @napi-rs/keyring and
 * friends load native `.node` binaries at runtime, so they must be resolved
 * from node_modules at run time, not inlined by the bundler.
 *
 * We list these explicitly rather than relying on electron-vite's
 * externalizeDepsPlugin — under Vite 8 / rolldown it let dockerode's optional
 * ssh2 → cpu-features chain into the graph and the build failed on a missing
 * .node file.
 */
const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'electron',
]

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external,
        // Two entries: the Electron main process, and the core service it
        // forks. The core is built separately so it stays free of any Electron
        // import and can later run as a standalone daemon.
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          core: resolve(__dirname, 'src/core/index.ts'),
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        external,
        input: resolve(__dirname, 'src/preload/index.ts'),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
  },
})
