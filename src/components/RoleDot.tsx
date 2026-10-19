import { cn } from "@/lib/utils/cn";
import type { RoleSummary } from "@/lib/auth/access";

// A role's flag: its coloured dot, named on hover.
export function RoleDot({ role, className }: { role: Pick<RoleSummary, "name" | "color">; className?: string }) {
  return (
    <span
      title={role.name}
      aria-label={role.name}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: role.color }}
    />
  );
}

// Several flags in a row, as on a file limited to some roles.
export function RoleDots({ roles, className }: { roles: Pick<RoleSummary, "id" | "name" | "color">[]; className?: string }) {
  if (roles.length === 0) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      {roles.map((role) => (
        <RoleDot key={role.id} role={role} />
      ))}
    </span>
  );
}
