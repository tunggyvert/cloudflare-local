/**
 * Guards the one rule that keeps the daemon path open:
 * src/core/** must never import from 'electron'.
 *
 * The core runs today as a forked child process. It is designed to be promoted
 * to a launchd / systemd / Windows service later without moving any logic —
 * but only while it has no Electron dependency. One import kills that.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src/core'
const IMPORT_ELECTRON = /^\s*(?:import\b[^;]*?from\s*|import\s*\(\s*|(?:const|let|var)\b[^=]*=\s*require\s*\(\s*)['"]electron(?:\/[^'"]*)?['"]/gm

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const violations = []
for (const file of walk(ROOT).filter((f) => /\.(ts|tsx|mts|js|mjs)$/.test(f))) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(IMPORT_ELECTRON)) {
    const line = src.slice(0, m.index).split('\n').length
    violations.push(`${file}:${line}  ${m[0].trim()}`)
  }
}

if (violations.length > 0) {
  console.error('\ncore isolation broken — src/core must not import from electron:\n')
  for (const v of violations) console.error('  ' + v)
  console.error('\nMove the Electron-dependent code into src/main/ instead.\n')
  process.exit(1)
}

console.log('core isolation ok — no electron imports in src/core')
