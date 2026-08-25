import { Entry } from '@napi-rs/keyring'

/**
 * Credentials live in the OS keychain, never on disk and never in a config file.
 *
 * Scoped API tokens only — this app must never ask for a Global API Key, and
 * refuses to store anything that looks like one.
 */
const SERVICE = 'cloudflare-local'

export interface StoredAccount {
  accountId: string
  label: string
}

export function saveToken(accountId: string, token: string): void {
  if (looksLikeGlobalKey(token)) {
    throw new Error(
      'That looks like a Global API Key. This app only accepts scoped API tokens — ' +
      'create one at dash.cloudflare.com/profile/api-tokens.',
    )
  }
  new Entry(SERVICE, accountId).setPassword(token)
}

export function readToken(accountId: string): string | null {
  try {
    return new Entry(SERVICE, accountId).getPassword()
  } catch {
    return null
  }
}

export function deleteToken(accountId: string): boolean {
  try {
    return new Entry(SERVICE, accountId).deletePassword()
  } catch {
    return false
  }
}

/** Global API Keys are exactly 37 lowercase hex chars. Scoped tokens are longer and mixed-case. */
function looksLikeGlobalKey(value: string): boolean {
  return /^[a-f0-9]{37}$/.test(value.trim())
}
