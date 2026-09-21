import test from 'node:test'
import assert from 'node:assert/strict'
import { getAugmentedPath, resolveBinary, getInstallHint } from '../src/core/supervisor/binary.ts'

test('BinaryResolution: getAugmentedPath includes platform paths', () => {
  const path = getAugmentedPath()
  assert.ok(path.length > 0, 'PATH should not be empty')

  if (process.platform === 'darwin') {
    // If running on macOS with Homebrew, /opt/homebrew/bin or /usr/local/bin should be present
    assert.ok(
      path.includes('/opt/homebrew/bin') || path.includes('/usr/local/bin'),
      'macOS augmented PATH should include homebrew location'
    )
  }
})

test('BinaryResolution: resolveBinary finds existing command or falls back gracefully', () => {
  // Common system command available on mac and linux
  if (process.platform !== 'win32') {
    const shPath = resolveBinary('sh')
    assert.ok(shPath.endsWith('sh'), `Expected path to end with sh, got ${shPath}`)
  }

  // Non-existent command returns original string
  const fake = resolveBinary('definitely-fake-cmd-12345')
  assert.equal(fake, 'definitely-fake-cmd-12345')
})

test('BinaryResolution: getInstallHint provides clear guidance', () => {
  const hint = getInstallHint('cloudflared')
  assert.ok(hint.length > 0)
  if (process.platform === 'darwin') {
    assert.ok(hint.includes('brew install cloudflared'))
  } else if (process.platform === 'win32') {
    assert.ok(hint.includes('winget install'))
  }
})
