import type { ReactNode } from 'react'

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded border border-border bg-surface">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-subtle">{children}</thead>
}

export function Th({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`type-table-header h-9 border-b border-border px-4 text-ink-secondary ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="[&>tr:last-child>td]:border-b-0">{children}</tbody>
}

export function Tr({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-border ${
        onClick ? 'cursor-pointer hover:bg-surface-hover' : 'hover:bg-surface-hover'
      } ${className}`}
    >
      {children}
    </tr>
  )
}

export function Td({
  children,
  mono = false,
  align = 'left',
  className = '',
}: {
  children: ReactNode
  mono?: boolean
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <td
      className={`h-9 px-4 ${mono ? 'type-code-md' : 'type-body-md'} ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  )
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="type-body-sm px-4 py-8 text-center text-ink-muted">
        {children}
      </td>
    </tr>
  )
}
