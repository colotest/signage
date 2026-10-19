"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CheckIcon, CloseIcon } from "@/components/icons/PlaybackIcons";
import { POPUP_BLUE_BUTTON, POPUP_WHITE_BUTTON, Popup } from "@/components/ui/Popup";
import { Switch } from "@/components/ui/Switch";
import { createRole, deleteRole, updateRole } from "@/lib/actions/roles";
import {
  PAGES,
  USERS_PERMISSIONS,
  distinctRoleColor,
  formatHsl,
  parseHsl,
  parseRoleAccess,
  type Hsl,
  type PageKey,
  type RoleAccess,
  type UsersPermission,
} from "@/lib/auth/access";
import { useViewer } from "@/lib/auth/ViewerContext";
import { cn } from "@/lib/utils/cn";
import type { Role } from "@/types/domain";

const FORM_ID = "role-form";

// "New Role" and "Edit <Role>" from the Users page's "⋯": a name with the
// role's coloured dot beside it (pressed, it opens an HSL picker), then
// every page with a switch for access — Screens and Users opening out, by
// their arrows, into ticks for what's inside them.
//
// Nobody can hand a role more than they can do themselves: whatever the
// viewer's own roles don't allow is shown greyed out (updateRole and
// createRole cap it too).
export function RoleDialog({
  open,
  onOpenChange,
  role,
  existingColors,
  screens,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Left out for a new role.
  role: Role | null;
  // Every other role's colour, for a new one to stand apart from.
  existingColors: string[];
  screens: { id: number; name: string }[];
  groups: { id: string; name: string }[];
}) {
  return (
    <Popup
      open={open}
      onOpenChange={onOpenChange}
      title={role ? `Edit ${role.name}` : "New Role"}
      className="max-w-[420px]"
      leading={
        <button type="button" onClick={() => onOpenChange(false)} title="Cancel" aria-label="Cancel" className={POPUP_WHITE_BUTTON}>
          <CloseIcon className="h-5 w-5" />
        </button>
      }
      // Submits the form below (RoleForm), which checks it has a name.
      trailing={
        <button type="submit" form={FORM_ID} title="Save" aria-label="Save" className={POPUP_BLUE_BUTTON}>
          <CheckIcon className="h-5 w-5" />
        </button>
      }
    >
      <RoleForm
        role={role}
        existingColors={existingColors}
        screens={screens}
        groups={groups}
        onDone={() => onOpenChange(false)}
      />
    </Popup>
  );
}

function RoleForm({
  role,
  existingColors,
  screens,
  groups,
  onDone,
}: {
  role: Role | null;
  existingColors: string[];
  screens: { id: number; name: string }[];
  groups: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const viewer = useViewer();
  const own = viewer.access;
  const [name, setName] = useState(role?.name ?? "");
  const [color, setColor] = useState(() => role?.color ?? distinctRoleColor(existingColors));
  const [access, setAccess] = useState<RoleAccess>(() => parseRoleAccess(role?.access));
  const [pickingColor, setPickingColor] = useState(false);
  const [expanded, setExpanded] = useState<Set<PageKey>>(new Set());
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageOn = (page: PageKey) => !!access.pages?.[page];
  const screensOn = pageOn("screens");

  function setPage(page: PageKey, on: boolean) {
    setAccess((current) => {
      const next: RoleAccess = { ...current, pages: { ...current.pages, [page]: on } };
      // Switching a page on for the first time opens up everything in it
      // that the viewer can give; individual ticks can come off after.
      if (on && page === "screens" && !current.screens) {
        next.screens = { hiddenScreens: [], hiddenGroups: [], settings: own.screens.settings, reorder: own.screens.reorder };
      }
      if (on && page === "users" && !current.users) {
        next.users = Object.fromEntries(USERS_PERMISSIONS.map(({ key }) => [key, own.users[key]]));
      }
      return next;
    });
    if (on && (page === "screens" || page === "users")) setExpanded((e) => new Set(e).add(page));
  }

  function setScreensOption(key: "settings" | "reorder", on: boolean) {
    setAccess((current) => ({ ...current, screens: { ...current.screens, [key]: on } }));
  }

  function toggleHidden(kind: "hiddenScreens" | "hiddenGroups", id: number | string) {
    setAccess((current) => {
      const list = (current.screens?.[kind] ?? []) as (number | string)[];
      const nextList = list.includes(id) ? list.filter((v) => v !== id) : [...list, id];
      return { ...current, screens: { ...current.screens, [kind]: nextList } };
    });
  }

  function setUsersOption(key: UsersPermission, on: boolean) {
    setAccess((current) => ({ ...current, users: { ...current.users, [key]: on } }));
  }

  function toggleExpanded(page: PageKey) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  }

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const input = { name, color, access };
      if (role) await updateRole(role.id, input);
      else await createRole(input);
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the role");
      setSaving(false);
    }
  }

  async function remove() {
    if (!role || saving) return;
    setSaving(true);
    try {
      await deleteRole(role.id);
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the role");
      setSaving(false);
    }
  }

  return (
    <form
      id={FORM_ID}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex items-center gap-3 px-1">
        <input
          autoFocus={!role}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Role name"
          maxLength={40}
          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-transparent px-3 py-2 text-[15px] outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => setPickingColor((p) => !p)}
          title="Change colour"
          aria-label="Change colour"
          aria-expanded={pickingColor}
          className="no-press h-7 w-7 shrink-0 rounded-full shadow-[var(--shadow-control)] ring-2 ring-white transition-transform hover:scale-110 dark:ring-white/20"
          style={{ backgroundColor: color }}
        />
      </div>

      {pickingColor && <HslPicker color={color} onChange={setColor} />}

      <p className="mb-1 mt-4 px-1 text-[12px] text-muted">Access</p>
      <ul className="flex flex-col">
        {PAGES.map((page) => {
          const on = pageOn(page.key);
          // Media comes with Screens: the Playback Menus hold the whole
          // library (see resolveAccess).
          const impliedMedia = page.key === "media" && screensOn;
          const expandable = page.key === "screens" || page.key === "users";
          const isExpanded = expandable && expanded.has(page.key);
          return (
            <li key={page.key} className="border-b border-border last:border-0">
              <div className="flex items-center gap-2 px-1 py-2.5">
                {expandable ? (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(page.key)}
                    aria-label={isExpanded ? `Collapse ${page.label}` : `Expand ${page.label}`}
                    className="no-press -m-1 p-1 text-muted hover:text-foreground"
                  >
                    <Chevron open={isExpanded} />
                  </button>
                ) : (
                  <span className="w-[22px] shrink-0" />
                )}
                <span className="min-w-0 flex-1 text-[15px]">
                  {page.label}
                  {impliedMedia && <span className="ml-2 text-[12px] text-muted">with Screens</span>}
                </span>
                <Switch
                  label={page.label}
                  checked={on || impliedMedia}
                  disabled={impliedMedia || (!on && !own.pages[page.key])}
                  onChange={(next) => setPage(page.key, next)}
                />
              </div>

              {isExpanded && page.key === "screens" && (
                <div className={cn("pb-2 pl-7", !on && "pointer-events-none opacity-45")}>
                  <Tick
                    label="Screen & group settings"
                    hint="Wrench menus, + New"
                    checked={!!access.screens?.settings}
                    disabled={!own.screens.settings}
                    onChange={(v) => setScreensOption("settings", v)}
                  />
                  <Tick
                    label="Reorder the grid"
                    checked={!!access.screens?.reorder}
                    disabled={!own.screens.reorder}
                    onChange={(v) => setScreensOption("reorder", v)}
                  />
                  {(groups.length > 0 || screens.length > 0) && (
                    <p className="mb-0.5 mt-2 text-[12px] text-muted">Shown on the grid</p>
                  )}
                  {groups.map((group) => (
                    <Tick
                      key={group.id}
                      label={group.name}
                      hint="Group"
                      checked={!access.screens?.hiddenGroups?.includes(group.id)}
                      onChange={() => toggleHidden("hiddenGroups", group.id)}
                    />
                  ))}
                  {screens.map((screen) => (
                    <Tick
                      key={screen.id}
                      label={screen.name}
                      hint={`/screen/${screen.id}`}
                      checked={!access.screens?.hiddenScreens?.includes(screen.id)}
                      onChange={() => toggleHidden("hiddenScreens", screen.id)}
                    />
                  ))}
                </div>
              )}

              {isExpanded && page.key === "users" && (
                <div className={cn("pb-2 pl-7", !on && "pointer-events-none opacity-45")}>
                  {USERS_PERMISSIONS.map(({ key, label }) => (
                    <Tick
                      key={key}
                      label={label}
                      checked={!!access.users?.[key]}
                      disabled={!own.users[key]}
                      onChange={(v) => setUsersOption(key, v)}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-3 px-1 text-[13px] text-danger">{error}</p>}

      {role && (
        <div className="mt-4 border-t border-border px-1 pt-3 text-[13px]">
          {confirmingDelete ? (
            <div className="flex items-center gap-3">
              <span className="text-muted">Delete {role.name} for everyone?</span>
              <button type="button" onClick={remove} disabled={saving} className="press-ghost font-medium text-danger hover:opacity-70">
                Confirm
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="press-ghost text-muted hover:opacity-70">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="press-ghost font-medium text-danger hover:opacity-70"
            >
              Delete Role
            </button>
          )}
        </div>
      )}
    </form>
  );
}

function Tick({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 text-[14px] hover:bg-black/[.03] dark:hover:bg-white/[.05]",
        disabled && "cursor-default opacity-45 hover:bg-transparent",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[17px] w-[17px] shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {/* The label keeps its room; a long hint gives way first. */}
      {hint && <span className="max-w-[45%] truncate text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

// Hue, saturation and lightness, each on a slider painted with the range
// it covers given the other two.
function HslPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const hsl = parseHsl(color) ?? { h: 210, s: 75, l: 52 };
  const set = (patch: Partial<Hsl>) => onChange(formatHsl({ ...hsl, ...patch }));
  const hueStops = Array.from({ length: 7 }, (_, i) => `hsl(${i * 60} ${hsl.s}% ${hsl.l}%)`).join(", ");

  return (
    <div className="mx-1 mt-3 flex flex-col gap-3 rounded-[var(--radius-md)] border border-border p-3">
      <HslSlider
        label="Hue"
        value={hsl.h}
        max={360}
        background={`linear-gradient(to right, ${hueStops})`}
        onChange={(h) => set({ h })}
      />
      <HslSlider
        label="Saturation"
        value={hsl.s}
        max={100}
        background={`linear-gradient(to right, hsl(${hsl.h} 0% ${hsl.l}%), hsl(${hsl.h} 100% ${hsl.l}%))`}
        onChange={(s) => set({ s })}
      />
      <HslSlider
        label="Lightness"
        value={hsl.l}
        max={100}
        background={`linear-gradient(to right, hsl(${hsl.h} ${hsl.s}% 0%), hsl(${hsl.h} ${hsl.s}% 50%), hsl(${hsl.h} ${hsl.s}% 100%))`}
        onChange={(l) => set({ l })}
      />
    </div>
  );
}

function HslSlider({
  label,
  value,
  max,
  background,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  background: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex justify-between text-[12px] text-muted">
        {label}
        <span className="tabular-nums">{Math.round(value)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "h-3 w-full cursor-pointer appearance-none rounded-full",
          "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.4)]",
          "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent",
        )}
        style={{ background }}
      />
    </label>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <polyline points="9 6 15 12 9 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
