import { cn } from "@/lib/utils/cn";
import type { HTMLAttributes } from "react";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "danger" }) {
  const toneClasses = {
    neutral: "bg-black/[.06] dark:bg-white/[.1] text-muted",
    success: "bg-success/15 text-success",
    danger: "bg-danger/15 text-danger",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium",
        toneClasses,
        className,
      )}
      {...props}
    />
  );
}
