// Three horizontal tracks with their knobs set at different points — the
// usual "adjust settings" glyph. Each track breaks around its knob rather
// than running through it, so the knobs read as rings at any size.
export function SlidersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 5h9.5M17.5 5h3.5" />
      <circle cx="15" cy="5" r="2.5" />
      <path d="M3 12h2.5M10.5 12h10.5" />
      <circle cx="8" cy="12" r="2.5" />
      <path d="M3 19h10.5M18.5 19h2.5" />
      <circle cx="16" cy="19" r="2.5" />
    </svg>
  );
}
