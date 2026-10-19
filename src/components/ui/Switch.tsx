"use client";

import { cn } from "@/lib/utils/cn";

// An iOS-style on/off switch.
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "no-press relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50",
        checked ? "bg-[#34c759]" : "bg-black/[.12] dark:bg-white/[.18]",
      )}
    >
      <span
        className={cn(
          "absolute left-[2px] top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform duration-200 ease-[var(--ease-spring)]",
          checked && "translate-x-[18px]",
        )}
      />
    </button>
  );
}
