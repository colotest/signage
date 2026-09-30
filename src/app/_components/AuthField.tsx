import type { InputHTMLAttributes } from "react";

// The login and signup pages' text fields.
export function AuthField(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="rounded-[var(--radius-md)] border border-border bg-black/[.03] dark:bg-white/[.06] px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-accent"
    />
  );
}
