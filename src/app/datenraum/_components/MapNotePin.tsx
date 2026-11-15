"use client";

import { WheelchairIcon } from "@/components/icons/WheelchairIcon";
import { cn } from "@/lib/utils/cn";

// A pin on the Datenraum's maps, from a note on an event's map (see
// datenraumGallery): a coloured dot — with the wheelchair inside, for a
// step-free way in — whose name shows only once it's tapped, and goes
// again with another tap.
export function MapNotePin({
  color,
  title,
  subtitle,
  wheelchair = false,
  open,
  onToggle,
}: {
  color: string;
  title: string;
  subtitle?: string;
  wheelchair?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const size = wheelchair ? 26 : 16;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={subtitle ? `${title}, ${subtitle}` : title}
        title={title}
        style={{ width: size, height: size, background: color }}
        className="no-press absolute left-0 top-0 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-[0_0_0_2.5px_#fff,0_2px_6px_var(--shadow-ambient-strong)]"
      >
        {wheelchair && <WheelchairIcon className="h-[17px] w-[17px]" />}
      </button>
      {open && title && (
        <div
          className={cn(
            "pop-in pointer-events-none absolute left-0 w-max max-w-[220px] -translate-x-1/2 rounded-[var(--radius-md)] border border-border glass-material px-3 py-1.5 text-center shadow-[var(--shadow-float)]",
          )}
          style={{ bottom: size / 2 + 6 }}
        >
          <p className="text-[13px] font-semibold leading-tight text-foreground">{title}</p>
          {subtitle && <p className="text-[12px] leading-tight text-muted">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}
