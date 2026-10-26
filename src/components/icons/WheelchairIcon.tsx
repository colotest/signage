// The wheelchair symbol, for marking what isn't step-free.
export function WheelchairIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="4" r="1.8" fill="currentColor" stroke="none" />
      <path d="M11 7.5v6h5.5l2.5 5" />
      <path d="M11 10.5h5" />
      <path d="M8 11.2a5.5 5.5 0 1 0 7.6 6.3" />
    </svg>
  );
}
