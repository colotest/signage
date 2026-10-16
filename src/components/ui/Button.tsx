import { cn } from "@/lib/utils/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "grey" | "ghost" | "danger";

// Filled variants are raised controls: a lit top rim and a small shadow
// (--shadow-control). Ghost has no surface of its own to light.
const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-accent-contrast shadow-[var(--shadow-control)] hover:opacity-90",
  secondary:
    "bg-black/[.05] dark:bg-white/[.08] text-foreground shadow-[var(--shadow-control)] hover:bg-black/[.08] dark:hover:bg-white/[.12]",
  // Like secondary, but solid: a popup it opens can turn back into its
  // colour as it closes, which a see-through fill can't give it.
  grey: "bg-[var(--control-fill)] text-foreground shadow-[var(--shadow-control)] hover:bg-[var(--control-fill-hover)]",
  ghost: "press-ghost-fit bg-transparent text-accent hover:bg-accent/10",
  danger: "bg-danger text-white shadow-[var(--shadow-control)] hover:opacity-90",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[15px] font-medium transition-all disabled:opacity-40 disabled:pointer-events-none",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
