import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * Returns an augmented PATH string including standard platform locations
 * where package managers (Homebrew, MacPorts, WinGet, Scoop, Chocolatey)
 * install binaries like cloudflared.
 */
export function getAugmentedPath(): string {
  const currentPath = process.env.PATH || ''
  const isWin = process.platform === 'win32'
  const delimiter = isWin ? ';' : ':'
  const extraPaths: string[] = []

  if (process.platform === 'darwin') {
    extraPaths.push(
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
      '/usr/local/sbin',
      '/opt/local/bin',
      join(homedir(), '.local/bin'),
      join(homedir(), 'bin'),
    )
  } else if (process.platform === 'linux') {
    extraPaths.push(
      '/usr/local/bin',
      '/usr/local/sbin',
      '/snap/bin',
      join(homedir(), '.local/bin'),
      join(homedir(), 'bin'),
    )
  } else if (isWin) {
    const localAppData = process.env.LOCALAPPDATA || ''
    const userProfile = process.env.USERPROFILE || ''
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'

    extraPaths.push(
      join(localAppData, 'Microsoft', 'WinGet', 'Links'),
      join(localAppData, 'Programs'),
      join(userProfile, 'scoop', 'shims'),
      'C:\\ProgramData\\chocolatey\\bin',
      join(programFiles, 'Cloudflare', 'cloudflared'),
      join(programFilesX86, 'Cloudflare', 'cloudflared'),
      join(userProfile, 'bin'),
    )
  }

  const existingParts = currentPath.split(delimiter).filter(Boolean)
  const toAdd = extraPaths.filter((p) => {
    try {
      return existsSync(p) && !existingParts.includes(p)
    } catch {
      return false
    }
  })

  return [...existingParts, ...toAdd].join(delimiter)
}

/**
 * Resolves the full path to a command if it is not already an absolute path.
 * Checks the augmented PATH for executables.
 */
export function resolveBinary(command: string): string {
  if (!command) return command

  const isWin = process.platform === 'win32'
  if (command.includes('/') || (isWin && command.includes('\\'))) {
    return command
  }

  const fullPath = getAugmentedPath()
  const delimiter = isWin ? ';' : ':'
  const dirs = fullPath.split(delimiter).filter(Boolean)
  const extensions = isWin ? ['.exe', '.cmd', '.bat', ''] : ['']

  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = join(dir, command + ext)
      try {
        if (existsSync(candidate)) {
          return candidate
        }
      } catch {
        // ignore access errors
      }
    }
  }

  return command
}

/**
 * Returns user-friendly install hints when a required binary cannot be found.
 */
export function getInstallHint(command: string): string {
  if (command.toLowerCase().includes('cloudflared')) {
    if (process.platform === 'darwin') {
      return "Run 'brew install cloudflared' in Terminal"
    }
    if (process.platform === 'win32') {
      return "Run 'winget install --id Cloudflare.cloudflared' in PowerShell"
    }
    return "Install cloudflared using your system package manager or from Cloudflare's GitHub releases"
  }
  return `Ensure '${command}' is installed and present in your system PATH`
}
