"use client";

import { createContext, useContext } from "react";
import type { User } from "@/types/domain";

// The signed-in user, handed down from the dashboard layout so any client
// component can hide what this user isn't allowed to do. Display only —
// the Server Actions enforce the same rules themselves.
export type Viewer = User & { isAdmin: boolean };

const ViewerContext = createContext<Viewer | null>(null);

export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  const viewer = useContext(ViewerContext);
  if (!viewer) throw new Error("useViewer must be used inside the dashboard layout");
  return viewer;
}
