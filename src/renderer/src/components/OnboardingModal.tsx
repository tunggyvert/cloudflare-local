import { useEffect, useState } from 'react'
import { IconClose } from '../icons'

interface OnboardingModalProps {
  open: boolean
  onConnected: () => void
  onClose?: () => void
}

export function OnboardingModal({ open, onConnected, onClose }: OnboardingModalProps) {
  const [accountId, setAccountId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [label, setLabel] = useState('')
  const [validating, setValidating] = useState(false)
  const [validated, setValidated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const handleValidate = async () => {
    if (!accountId || !apiToken) return

    setValidating(true)
    setError(null)
    setValidated(false)

    try {
      const result = await window.core.invoke('account.validate', { accountId, apiToken })
      if (result.ok) {
        setValidated(true)
      } else {
        setError(result.detail || 'Validation failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed')
    } finally {
      setValidating(false)
    }
  }

  const handleSave = async () => {
    if (!validated) return

    setSaving(true)
    setError(null)

    try {
      await window.core.invoke('account.save', { accountId, apiToken, label: label || undefined })
      onConnected()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account')
    } finally {
      setSaving(false)
    }
  }

  const canValidate = accountId.trim().length > 0 && apiToken.trim().length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose()
        }
      }}
    >
      <div className="w-full max-w-md bg-surface border border-border rounded shadow-lg p-6 flex flex-col">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
          <h2 className="type-headline-sm text-ink">Connect your Cloudflare account</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded p-1 text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors"
              aria-label="Close"
            >
              <IconClose className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-4 mb-5">
          <div className="flex flex-col">
            <label className="type-body-sm font-medium text-ink mb-1">Account ID</label>
            <input
              type="text"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value)
                setValidated(false)
              }}
              placeholder="32-character account ID"
              className="w-full rounded border border-border bg-surface px-3 py-2 type-code-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex flex-col">
            <label className="type-body-sm font-medium text-ink mb-1">API Token</label>
            <input
              type="password"
              value={apiToken}
              onChange={(e) => {
                setApiToken(e.target.value)
                setValidated(false)
              }}
              placeholder="Scoped API token"
              className="w-full rounded border border-border bg-surface px-3 py-2 type-code-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex flex-col">
            <label className="type-body-sm font-medium text-ink mb-1">Label (Optional)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. My Production Account"
              className="w-full rounded border border-border bg-surface px-3 py-2 type-body-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="rounded bg-surface-subtle border border-border p-3 type-code-xs text-ink-secondary mb-5">
          <p className="mb-1.5 font-medium text-ink">Required Token Permissions:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Account → Cloudflare Tunnel: Read</li>
            <li>Zone → DNS: Edit</li>
            <li>Zone → Zone: Read</li>
          </ul>
        </div>

        {error && (
          <div className="mb-4 type-body-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleValidate}
              disabled={!canValidate || validating}
              className="px-3 py-1.5 type-body-sm rounded border border-border text-ink bg-surface hover:bg-surface-hover disabled:opacity-50 transition-colors"
            >
              {validating ? 'Validating…' : 'Validate'}
            </button>
            {validated && (
              <span className="type-code-xs text-green-600 font-medium">
                ✓ Validated
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 type-body-sm rounded border border-border text-ink-secondary hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!validated || saving}
              className="px-4 py-1.5 type-body-sm rounded text-white bg-accent hover:bg-accent/90 disabled:opacity-50 transition-colors font-medium shadow-xs"
            >
              {saving ? 'Saving…' : 'Save & Connect'}
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-border flex justify-between items-center text-xs">
          <a
            href="https://dash.cloudflare.com/profile/api-tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-strong hover:underline inline-block"
          >
            Create scoped API token →
          </a>
        </div>
      </div>
    </div>
  )
}
