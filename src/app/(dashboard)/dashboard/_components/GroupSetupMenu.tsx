"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Menu } from "@/components/ui/Menu";
import { deleteGroup } from "@/lib/actions/groups";
import { removeWithAnimation } from "@/lib/animation/listMotion";
import { WrenchIcon } from "@/components/icons/WrenchIcon";

const MAX_GRID = 12;

const ITEM =
  "press-ghost-fit block w-full rounded-[var(--radius-sm)] px-2 py-1 text-left text-[13px] font-medium text-foreground hover:bg-black/[.04] dark:hover:bg-white/[.06]";

// A group card's wrench: the same place a screen keeps its setup, holding
// the group's — which screens are in it, its name, the size of the grid its
// monitors are arranged in, a reload for all of them, and deleting it.
// Admins only, like the screen wrench (the actions check too).
export function GroupSetupMenu({
  groupId,
  rows,
  cols,
  memberCount,
  onEditGroup,
  onRename,
  onSetGrid,
  onReload,
}: {
  groupId: string;
  rows: number;
  cols: number;
  memberCount: number;
  onEditGroup: () => void;
  onRename: () => void;
  onSetGrid: (rows: number, cols: number) => void;
  onReload: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reloadSent, setReloadSent] = useState(false);
  const reloadSentTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(reloadSentTimerRef.current), []);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
  }

  function toggle() {
    if (open) return close();
    setConfirmingDelete(false);
    setOpen(true);
  }

  function handleReload() {
    onReload();
    setReloadSent(true);
    clearTimeout(reloadSentTimerRef.current);
    reloadSentTimerRef.current = setTimeout(() => setReloadSent(false), 2000);
  }

  function handleDelete() {
    const tile = containerRef.current?.closest<HTMLElement>("[data-screen-tile]");
    startTransition(async () => {
      await removeWithAnimation(tile, () => deleteGroup(groupId));
      router.refresh();
    });
  }

  // The grid has to keep a cell for every member.
  const canShrinkRows = rows > 1 && (rows - 1) * cols >= memberCount;
  const canShrinkCols = cols > 1 && rows * (cols - 1) >= memberCount;

  return (
    <div ref={containerRef} className="shrink-0">
      <button
        ref={anchorRef}
        type="button"
        onClick={toggle}
        title="Group setup"
        aria-label="Group setup"
        aria-expanded={open}
        className="press-ghost-fit rounded-full p-1.5 text-muted transition-colors hover:text-foreground"
      >
        <WrenchIcon className="h-4 w-4" />
      </button>

      <Menu
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        align="start"
        dragSelect={false}
        role="dialog"
        aria-label="Group setup"
        className="w-56 p-3"
      >
        <button
          type="button"
          onClick={() => {
            close();
            onEditGroup();
          }}
          className={ITEM}
        >
          Edit Group
        </button>
        <button
          type="button"
          onClick={() => {
            close();
            onRename();
          }}
          className={`${ITEM} mt-1`}
        >
          Rename
        </button>

        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 text-[11px] text-muted">Grid</p>
          <Stepper
            label="Rows"
            value={rows}
            canDecrease={canShrinkRows}
            canIncrease={rows < MAX_GRID}
            onChange={(next) => onSetGrid(next, cols)}
          />
          <Stepper
            label="Columns"
            value={cols}
            canDecrease={canShrinkCols}
            canIncrease={cols < MAX_GRID}
            onChange={(next) => onSetGrid(rows, next)}
          />
        </div>

        <div className="mt-3 border-t border-border pt-3">
          <button
            type="button"
            onClick={handleReload}
            title="Fully reload the player page on every screen in this group"
            className="press-ghost mb-3 block text-[13px] font-medium text-foreground hover:opacity-70"
          >
            {reloadSent ? "Reload sent ✓" : "Reload Screens"}
          </button>
          {confirmingDelete ? (
            <div className="flex items-center gap-2 text-[13px]">
              <span className="text-muted">Delete group?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="press-ghost font-medium text-danger hover:opacity-70"
              >
                {pending ? "Deleting…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={pending}
                className="press-ghost text-muted hover:opacity-70"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              title="The screens stay, and keep playing what they have"
              className="press-ghost text-[13px] font-medium text-danger hover:opacity-70"
            >
              Delete Group
            </button>
          )}
        </div>
      </Menu>
    </div>
  );
}

function Stepper({
  label,
  value,
  canDecrease,
  canIncrease,
  onChange,
}: {
  label: string;
  value: number;
  canDecrease: boolean;
  canIncrease: boolean;
  onChange: (value: number) => void;
}) {
  const step = "press-ghost-fit flex h-7 w-7 items-center justify-center rounded-full text-[15px] text-foreground disabled:opacity-30";
  return (
    <div className="flex items-center justify-between py-0.5 text-[13px]">
      <span>{label}</span>
      <div className="flex items-center gap-1 rounded-full bg-black/[.05] p-0.5 shadow-[var(--shadow-well)] dark:bg-white/[.08]">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={!canDecrease}
          aria-label={`Fewer ${label.toLowerCase()}`}
          className={step}
        >
          −
        </button>
        <span className="w-5 text-center font-medium tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={!canIncrease}
          aria-label={`More ${label.toLowerCase()}`}
          className={step}
        >
          +
        </button>
      </div>
    </div>
  );
}
