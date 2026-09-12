// Shimmering placeholder for data that hasn't arrived yet - used while the
// orchestrator load is in flight, and left in place (rather than swapped
// for a red error) when that load fails, so the page reads as "still loading."
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`skeleton block ${className}`} />
}
