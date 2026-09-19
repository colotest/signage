export function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function PauseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </svg>
  );
}

export function SkipBackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M6 6h2v12H6z" />
      <path d="M20 6L10 12l10 6z" />
    </svg>
  );
}

export function SkipForwardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M16 6h2v12h-2z" />
      <path d="M4 6l10 6-10 6z" />
    </svg>
  );
}

// Three stacked list lines with a play triangle leading the top one — the
// Screens tile's "open this screen's Playback Menu" button.
export function PlaylistPlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M1.5 3.5v5l4.5-2.5z" fill="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
      <path d="M11 6h10" />
      <path d="M3 12h18" />
      <path d="M3 18h18" />
    </svg>
  );
}

export function AlarmClockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="13" r="7" />
      <path d="M12 9.5V13l2.5 2" />
      <path d="M4 5.5 6.5 3" />
      <path d="M20 5.5 17.5 3" />
      <path d="M6.5 19.5 5 21" />
      <path d="M17.5 19.5 19 21" />
    </svg>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="5 12.5 10 17.5 19 7" />
    </svg>
  );
}
