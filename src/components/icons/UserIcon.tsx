// A generic person silhouette (head and shoulders), filled, drawn to sit
// inside a circular avatar that clips the shoulders at its edge.
export function UserIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <circle cx="12" cy="9" r="4.25" />
      <path d="M3.5 22.5c0-4.7 3.8-8 8.5-8s8.5 3.3 8.5 8z" />
    </svg>
  );
}
