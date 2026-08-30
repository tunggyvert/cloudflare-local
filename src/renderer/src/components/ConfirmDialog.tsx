import React from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  /** Content shown in the body (e.g. a diff view) */
  children?: React.ReactNode
  /** Label for the confirm button */
  confirmLabel?: string
  /** Whether the action is destructive (makes button red) */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40">
      <div className="w-full max-w-lg bg-surface border border-border rounded shadow-sm flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="type-headline-sm text-ink">{title}</h2>
          {description && (
            <p className="type-body-sm text-ink-secondary mt-1">{description}</p>
          )}
        </div>
        
        {children && (
          <div className="p-4 flex-1 overflow-auto max-h-[60vh]">
            {children}
          </div>
        )}
        
        <div className="p-4 border-t border-border flex justify-end gap-3 bg-surface-subtle">
          <button
            onClick={onCancel}
            className="px-4 py-2 type-body-sm rounded border border-border text-ink-secondary hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 type-body-sm rounded transition-colors ${
              destructive
                ? 'bg-red-600 hover:bg-red-700 text-white border-transparent'
                : 'bg-accent hover:bg-accent/90 text-white border-transparent'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
