"use client";

import { createContext, useContext } from "react";
import type { User } from "@/types/domain";
import type { Access, RoleSummary } from "./access";

// The signed-in user, handed down from the dashboard layout so any client
// component can hide what this user isn't allowed to do. Display only —
// the Server Actions enforce the same rules themselves.
export type Viewer = User & {
  access: Access;
  // The roles they hold — the only ones they're ever shown (as names, or as
  // the coloured dots that flag content).
  roles: RoleSummary[];
};

const ViewerContext = createContext<Viewer | null>(null);

export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  const viewer = useContext(ViewerContext);
  if (!viewer) throw new Error("useViewer must be used inside the dashboard layout");
  return viewer;
}

// The viewer's own roles among `roleIds`, in the viewer's order — what a
// row of flags shows. Roles the viewer doesn't hold are never revealed.
export function useOwnRoles(roleIds: string[]): RoleSummary[] {
  const viewer = useViewer();
  return viewer.roles.filter((role) => roleIds.includes(role.id));
}
