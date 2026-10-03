import type { UserRole } from "@/types/domain";

// The super admin's is left blank on purpose: the account isn't labelled
// anywhere it's shown.
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "",
  admin: "Admin",
  default: "Default",
};

// Higher outranks lower. Only someone ranked above an account may delete it.
export const ROLE_RANK: Record<UserRole, number> = { default: 0, admin: 1, super_admin: 2 };
