// Shimmering placeholder for data that hasn't arrived yet.
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`skeleton block ${className}`} />
}
