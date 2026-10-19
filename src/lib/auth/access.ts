// What a user may see and do, worked out from their roles (0032). Shared by
// the server, which enforces it, and the client, which hides what it
// forbids — so it holds no server-only imports.

export type PageKey = "screens" | "media" | "forms" | "users";

export const PAGES: { key: PageKey; label: string; href: string }[] = [
  { key: "screens", label: "Screens", href: "/dashboard" },
  { key: "media", label: "Media", href: "/library" },
  { key: "forms", label: "Forms", href: "/forms" },
  { key: "users", label: "Users", href: "/users" },
];

export type UsersPermission = "delete" | "nicknames" | "assignRoles" | "manageRoles" | "signups" | "viewChanges";

export const USERS_PERMISSIONS: { key: UsersPermission; label: string }[] = [
  { key: "delete", label: "Delete users" },
  { key: "nicknames", label: "Edit nicknames" },
  { key: "assignRoles", label: "Assign roles" },
  { key: "manageRoles", label: "View, create and edit roles" },
  { key: "signups", label: "Create signup links" },
  { key: "viewChanges", label: "View changes made" },
];

// One role's settings, as stored in roles.access. Anything missing counts
// as off (or, for the hidden lists, as nothing hidden).
export type RoleAccess = {
  pages?: Partial<Record<PageKey, boolean>>;
  screens?: {
    hiddenScreens?: number[];
    hiddenGroups?: string[];
    // The wrench menus, + New Screen and + New Group.
    settings?: boolean;
    // Dragging tiles around the grid.
    reorder?: boolean;
  };
  users?: Partial<Record<UsersPermission, boolean>>;
};

// What all of a user's roles add up to.
export type Access = {
  superAdmin: boolean;
  // Every role the user holds — all of them, for the super admin.
  roleIds: string[];
  pages: Record<PageKey, boolean>;
  screens: {
    // Hidden from every one of the user's roles that has the Screens page.
    hiddenScreens: number[];
    hiddenGroups: string[];
    settings: boolean;
    reorder: boolean;
  };
  users: Record<UsersPermission, boolean>;
};

const NO_USERS_PERMISSIONS: Record<UsersPermission, boolean> = {
  delete: false,
  nicknames: false,
  assignRoles: false,
  manageRoles: false,
  signups: false,
  viewChanges: false,
};

export function parseRoleAccess(value: unknown): RoleAccess {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RoleAccess) : {};
}

// Roles only ever add: a page, a screen or an option is allowed if any one
// role allows it. A screen is hidden only if every role that has the
// Screens page hides it. The Media page comes with Screens, since every
// Playback Menu holds the whole library.
export function resolveAccess(superAdmin: boolean, roles: { id: string; access: unknown }[]): Access {
  if (superAdmin) {
    return {
      superAdmin: true,
      roleIds: roles.map((r) => r.id),
      pages: { screens: true, media: true, forms: true, users: true },
      screens: { hiddenScreens: [], hiddenGroups: [], settings: true, reorder: true },
      users: Object.fromEntries(Object.keys(NO_USERS_PERMISSIONS).map((k) => [k, true])) as Record<UsersPermission, boolean>,
    };
  }

  const parsed = roles.map((r) => parseRoleAccess(r.access));
  const pages: Record<PageKey, boolean> = { screens: false, media: false, forms: false, users: false };
  for (const access of parsed) {
    for (const page of PAGES) if (access.pages?.[page.key]) pages[page.key] = true;
  }
  if (pages.screens) pages.media = true;

  const screenRoles = parsed.filter((a) => a.pages?.screens);
  const hiddenEverywhere = <T,>(lists: T[][]) =>
    lists.length === 0 ? [] : lists.reduce((acc, list) => acc.filter((id) => list.includes(id)));

  const users = { ...NO_USERS_PERMISSIONS };
  for (const access of parsed.filter((a) => a.pages?.users)) {
    for (const key of Object.keys(users) as UsersPermission[]) if (access.users?.[key]) users[key] = true;
  }

  return {
    superAdmin: false,
    roleIds: roles.map((r) => r.id),
    pages,
    screens: {
      hiddenScreens: hiddenEverywhere(screenRoles.map((a) => a.screens?.hiddenScreens ?? [])),
      hiddenGroups: hiddenEverywhere(screenRoles.map((a) => a.screens?.hiddenGroups ?? [])),
      settings: screenRoles.some((a) => a.screens?.settings),
      reorder: screenRoles.some((a) => a.screens?.reorder),
    },
    users,
  };
}

export function canSeeScreen(access: Access, screenId: number) {
  return access.pages.screens && !access.screens.hiddenScreens.includes(screenId);
}

export function canSeeGroup(access: Access, groupId: string) {
  return access.pages.screens && !access.screens.hiddenGroups.includes(groupId);
}

// Where someone lands after logging in: the first page they can reach, or
// an empty page under the header when they can't reach any.
export function landingPath(access: Access) {
  return PAGES.find((page) => access.pages[page.key])?.href ?? "/home";
}

// Whether someone may rename, move, delete (or share) a file, PDF or
// folder: its owner and the super admin always may; anyone else only if
// it isn't limited to certain roles, or they hold one of them.
export function canEditOwned(
  viewer: { id: string; access: Access },
  item: { ownerId: string | null; editRoleIds: string[] },
) {
  if (viewer.access.superAdmin || (item.ownerId !== null && item.ownerId === viewer.id)) return true;
  return item.editRoleIds.length === 0 || item.editRoleIds.some((id) => viewer.access.roleIds.includes(id));
}

// Who may change those limits: the owner, and the super admin.
export function canRestrictOwned(viewer: { id: string; access: Access }, ownerId: string | null) {
  return viewer.access.superAdmin || (ownerId !== null && ownerId === viewer.id);
}

// A role as the client sees one (only ever the viewer's own).
export type RoleSummary = { id: string; name: string; color: string };

// A new role's dot: a clear, saturated colour whose hue sits as far as
// possible from every existing role's.
export function distinctRoleColor(existing: string[]): string {
  const hues = existing.map((c) => parseHsl(c)?.h).filter((h): h is number => h !== undefined);
  let best = Math.floor(Math.random() * 360);
  if (hues.length > 0) {
    let bestGap = -1;
    // Candidates every 15°, starting from a random offset so ties don't
    // always land on the same hue.
    const offset = Math.floor(Math.random() * 15);
    for (let h = offset; h < 360; h += 15) {
      const gap = Math.min(...hues.map((other) => Math.min(Math.abs(h - other), 360 - Math.abs(h - other))));
      if (gap > bestGap) {
        bestGap = gap;
        best = h;
      }
    }
  }
  return formatHsl({ h: best, s: 75, l: 52 });
}

export type Hsl = { h: number; s: number; l: number };

export function parseHsl(color: string): Hsl | null {
  const match = /^hsl\(\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*\)$/.exec(color);
  if (!match) return null;
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

export function formatHsl({ h, s, l }: Hsl) {
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
}
