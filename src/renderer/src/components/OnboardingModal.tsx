import { useState } from 'react'

interface OnboardingModalProps {
  open: boolean
  onConnected: () => void
}

export function OnboardingModal({ open, onConnected }: OnboardingModalProps) {
  const [accountId, setAccountId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [label, setLabel] = useState('')
  const [validating, setValidating] = useState(false)
  const [validated, setValidated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40">
      <div className="w-full max-w-md bg-surface border border-border rounded shadow-sm p-6 flex flex-col">
        <h2 className="type-headline-sm text-ink mb-6">Connect your Cloudflare account</h2>
        
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col">
            <label className="type-body-sm font-medium text-ink mb-1">Account ID</label>
            <input
              type="text"
              value={accountId}
              onChange={e => {
                setAccountId(e.target.value)
                setValidated(false)
              }}
              placeholder="32-character account ID"
              className="w-full rounded border border-border bg-surface px-3 py-2 type-body-sm text-ink focus:border-accent focus:outline-none font-[family-name:var(--font-mono)]"
            />
          </div>
          
          <div className="flex flex-col">
            <label className="type-body-sm font-medium text-ink mb-1">API Token</label>
            <input
              type="password"
              value={apiToken}
              onChange={e => {
                setApiToken(e.target.value)
                setValidated(false)
              }}
              placeholder="Scoped API token"
              className="w-full rounded border border-border bg-surface px-3 py-2 type-body-sm text-ink focus:border-accent focus:outline-none font-[family-name:var(--font-mono)]"
            />
          </div>

          <div className="flex flex-col">
            <label className="type-body-sm font-medium text-ink mb-1">Label</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. My Project"
              className="w-full rounded border border-border bg-surface px-3 py-2 type-body-sm text-ink focus:border-accent focus:outline-none font-[family-name:var(--font-mono)]"
            />
          </div>
        </div>

        <div className="rounded bg-surface-subtle border border-border p-3 type-code-sm text-ink-secondary mb-6">
          <p className="mb-2 font-medium">Required Permissions:</p>
          <ul className="list-disc list-inside">
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

        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex-1 flex items-center gap-3">
            <button
              onClick={handleValidate}
              disabled={!canValidate || validating}
              className="px-4 py-2 type-body-sm rounded border border-border text-ink bg-surface hover:bg-surface-hover disabled:opacity-50 transition-colors"
            >
              {validating ? 'Validating...' : 'Validate'}
            </button>
            {validated && (
              <span className="type-body-sm text-green-600 font-medium">
                ✓ Connected successfully
              </span>
            )}
          </div>
          
          <button
            onClick={handleSave}
            disabled={!validated || saving}
            className="px-4 py-2 type-body-sm rounded text-white bg-accent hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save & Connect'}
          </button>
        </div>

        <a
          href="https://dash.cloudflare.com/profile/api-tokens"
          target="_blank"
          rel="noopener noreferrer"
          className="type-body-sm text-accent hover:underline inline-block mt-2"
        >
          Create a scoped API token →
        </a>
      </div>
    </div>
  )
}
