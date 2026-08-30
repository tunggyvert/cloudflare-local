export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="type-body-sm mb-6 rounded border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-red-900">
      {message}
    </div>
  )
}
