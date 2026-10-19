"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/Card";
import { PlaylistPlayIcon } from "@/components/icons/PlaybackIcons";
import { moveGroupMember, renameGroup, setGroupFitMode, setGroupGrid, setGroupMembers } from "@/lib/actions/groups";
import { regrid } from "@/lib/groups/grid";
import { useScreensControl } from "@/lib/realtime/useScreenControl";
import type { ScreenLiveStatus } from "@/lib/realtime/useScreenStatuses";
import { useViewer } from "@/lib/auth/ViewerContext";
import { cn } from "@/lib/utils/cn";
import type {
  MediaItem,
  PlaylistItemWithMedia,
  Screen,
  ScreenGroup,
  ScreenGroupMember,
  SetupWithItems,
} from "@/types/domain";
import { FitModeToggle } from "./FitModeToggle";
import { GroupDialog } from "./GroupDialog";
import { GroupSetupMenu } from "./GroupSetupMenu";
import { PlaybackControls } from "./PlaybackControls";
import { PlaybackMenu, type LibraryData } from "./PlaybackMenu";
import { ScreenPreview } from "./ScreenPreview";
import { ScreenTitle } from "./ScreenTitle";
import { FRAME_LONG } from "./ScreenTile";

// The monitors share the same square a single screen's preview sits in, so
// a group's tile is exactly the size of a screen's.
const BOX = FRAME_LONG;
const GAP = 10;
// Room under each monitor for its name.
const LABEL_HEIGHT = 16;
// A single screen's preview border is 7px on a 194px-high frame; the small
// monitors keep that proportion, down to a hairline.
const BORDER_RATIO = 7 / 194;

export type GroupMemberView = {
  screen: Screen;
  playlist: PlaylistItemWithMedia[];
  status: ScreenLiveStatus | null;
};

// A group on the dashboard: the same card as a screen's, acting on every
// screen in it, under an arrangement of small monitors — one per member,
// each showing that screen's live picture whatever it's playing. A member
// that isn't playing the group's setup (its own, or another group's, was
// committed onto it more recently) has its name fade in and out.
export function GroupTile({
  group,
  members,
  screens,
  library,
  mediaById,
}: {
  group: ScreenGroup & { members: ScreenGroupMember[]; setup: SetupWithItems };
  // The members' screens, keyed by id.
  members: Map<number, GroupMemberView>;
  // Every screen, for Edit Group's list.
  screens: { id: number; name: string }[];
  library: LibraryData;
  mediaById: Map<string, MediaItem>;
}) {
  const router = useRouter();
  const viewer = useViewer();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [, startTransition] = useTransition();

  const memberIds = group.members.map((m) => m.screen_id).filter((id) => members.has(id));
  const { send } = useScreensControl(memberIds);

  // Grid size and cells, moved locally first so the monitors rearrange on
  // the press or drop, then saved; both resync whenever the group comes
  // back down from the server.
  const serverSlots = new Map(group.members.map((m) => [m.screen_id, m.slot]));
  const [local, setLocal] = useState(() => ({
    source: group,
    rows: group.grid_rows,
    cols: group.grid_cols,
    slots: serverSlots,
  }));
  let { rows, cols, slots } = local;
  if (local.source !== group) {
    rows = group.grid_rows;
    cols = group.grid_cols;
    slots = serverSlots;
    setLocal({ source: group, rows, cols, slots });
  }

  function handleSetGrid(nextRows: number, nextCols: number) {
    setLocal((current) => ({
      ...current,
      rows: nextRows,
      cols: nextCols,
      slots: regrid(current.slots, current.cols, nextRows, nextCols),
    }));
    startTransition(async () => {
      try {
        await setGroupGrid(group.id, nextRows, nextCols);
      } catch (err) {
        console.error("Failed to resize the group's grid", err);
      }
      router.refresh();
    });
  }

  function handleMove(screenId: number, slot: number) {
    const from = slots.get(screenId);
    if (from === undefined || from === slot) return;
    setLocal((current) => {
      const next = new Map(current.slots);
      for (const [id, s] of current.slots) if (s === slot) next.set(id, from);
      next.set(screenId, slot);
      return { ...current, slots: next };
    });
    startTransition(async () => {
      try {
        await moveGroupMember(group.id, screenId, slot);
      } catch (err) {
        console.error("Failed to move the screen", err);
      }
      router.refresh();
    });
  }

  // Paused when every member that's online reports paused — then the
  // button offers Play to all of them. The button's own press shows at
  // once, until the next report.
  const online = memberIds.map((id) => members.get(id)!.status).filter((s) => s?.online);
  const reportedPaused = online.length > 0 ? online.every((s) => s!.paused) : null;
  const [pausedOverride, setPausedOverride] = useState<boolean | null>(null);
  const [prevReportedPaused, setPrevReportedPaused] = useState(reportedPaused);
  if (reportedPaused !== prevReportedPaused) {
    setPrevReportedPaused(reportedPaused);
    setPausedOverride(null);
  }
  const [localPaused, setLocalPaused] = useState(false);
  const paused = pausedOverride ?? reportedPaused ?? localPaused;

  const [fitMode, setOptimisticFitMode] = useOptimistic(group.fit_mode);

  async function handleEditGroup(name: string, screenIds: number[]) {
    await Promise.all([
      name !== group.name ? renameGroup(group.id, name) : Promise.resolve(),
      setGroupMembers(group.id, screenIds),
    ]);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-col gap-[18px]">
        <MonitorGrid
          groupSetupId={group.setup.id}
          rows={rows}
          cols={cols}
          slots={slots}
          members={members}
          mediaById={mediaById}
          // Each monitor shows its own screen's Fit/Fill — only while a
          // press on the group's pill is still being saved does that
          // stand in for all of them.
          fitOverride={fitMode !== group.fit_mode ? fitMode : null}
          paused={paused}
          canArrange={viewer.access.screens.settings}
          onMove={handleMove}
          onOpen={() => setMenuOpen(true)}
        />

        <Card className="flex items-center gap-3 p-4">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="relative flex min-w-0 items-center gap-1">
              <ScreenTitle
                name={group.name}
                editing={renaming}
                onDoneEditing={() => setRenaming(false)}
                onSave={(name) => renameGroup(group.id, name)}
              />
              {!renaming && viewer.access.screens.settings && (
                <GroupSetupMenu
                  groupId={group.id}
                  rows={rows}
                  cols={cols}
                  memberCount={memberIds.length}
                  onEditGroup={() => setEditOpen(true)}
                  onRename={() => setRenaming(true)}
                  onSetGrid={handleSetGrid}
                  onReload={() => send({ type: "reload" })}
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              <FitModeToggle
                fitMode={fitMode}
                onOptimisticChange={setOptimisticFitMode}
                onSave={(next) => setGroupFitMode(group.id, next)}
              />
              <PlaybackControls
                send={send}
                paused={paused}
                onTogglePaused={() => {
                  setPausedOverride(!paused);
                  setLocalPaused(!paused);
                }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            title="Playback"
            aria-label="Open the group's playback menu"
            className="-my-2 flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-[var(--shadow-control)] transition-all hover:opacity-90"
          >
            <PlaylistPlayIcon className="h-9 w-9" />
          </button>
        </Card>
      </div>

      <PlaybackMenu
        title={group.name}
        setup={group.setup}
        screenId={null}
        library={library}
        schedules={[]}
        open={menuOpen}
        onOpenChange={setMenuOpen}
      />

      <GroupDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        screens={screens}
        initialSelected={memberIds}
        initialName={group.name}
        onSubmit={handleEditGroup}
      />
    </>
  );
}

// The arrangement: rows × cols cells filling the preview square, each
// holding one member's monitor (or nothing), with its name underneath.
// Those with the Screens page's settings can drag a monitor into another
// cell; whoever was there swaps into its old one.
function MonitorGrid({
  groupSetupId,
  rows,
  cols,
  slots,
  members,
  mediaById,
  fitOverride,
  paused,
  canArrange,
  onMove,
  onOpen,
}: {
  groupSetupId: string;
  rows: number;
  cols: number;
  slots: Map<number, number>;
  members: Map<number, GroupMemberView>;
  mediaById: Map<string, MediaItem>;
  fitOverride: ScreenGroup["fit_mode"] | null;
  paused: boolean;
  canArrange: boolean;
  onMove: (screenId: number, slot: number) => void;
  onOpen: () => void;
}) {
  // A press that ended a drag also ends in a click; that one shouldn't
  // open the menu.
  const lastDragEndRef = useRef(0);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const cellWidth = (BOX - GAP * (cols - 1)) / cols;

  const bySlot = new Map<number, number>();
  for (const [screenId, slot] of slots) if (members.has(screenId)) bySlot.set(slot, screenId);

  // Each row is as tall as its tallest monitor at the cells' full width
  // (a landscape one, for a row with none), then all of them shrink
  // together if that's more than the square holds, and the arrangement is
  // centred in it — so a single row of landscape screens isn't left
  // hanging at the top of an empty square.
  const naturalRows = Array.from({ length: rows }, (_, row) => {
    let tallest = cellWidth / (16 / 9);
    for (let col = 0; col < cols; col++) {
      const id = bySlot.get(row * cols + col);
      const rotation = id !== undefined ? members.get(id)?.screen.rotation : undefined;
      if (rotation === 90 || rotation === 270) tallest = Math.max(tallest, cellWidth / (9 / 16));
    }
    return tallest + LABEL_HEIGHT;
  });
  const naturalTotal = naturalRows.reduce((sum, h) => sum + h, 0);
  const fitScale = Math.min(1, (BOX - GAP * (rows - 1)) / naturalTotal);
  const rowHeights = naturalRows.map((h) => h * fitScale);
  const rowTops: number[] = [];
  let y = (BOX - (rowHeights.reduce((sum, h) => sum + h, 0) + GAP * (rows - 1))) / 2;
  for (const h of rowHeights) {
    rowTops.push(y);
    y += h + GAP;
  }

  function handleDragEnd(event: DragEndEvent) {
    lastDragEndRef.current = performance.now();
    const { active, over } = event;
    if (!over) return;
    onMove(Number(active.id), Number(String(over.id).replace("cell-", "")));
  }

  function handleOpen() {
    if (performance.now() - lastDragEndRef.current < 250) return;
    onOpen();
  }

  return (
    <div
      className="relative self-center shrink-0"
      style={{ width: BOX, height: BOX }}
      // Dragging a monitor rearranges the group; it mustn't pick up the
      // whole tile (see startsTileDrag in ScreenGrid).
      data-no-tile-drag={canArrange ? "" : undefined}
    >
      {slots.size === 0 ? (
        <button
          type="button"
          onClick={handleOpen}
          className="flex h-full w-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-border px-6 text-center text-[13px] text-muted"
        >
          No screens in this group yet — add some with Edit Group in the wrench menu.
        </button>
      ) : (
        // id: a stable one keeps dnd-kit's generated accessibility ids the
        // same in the server render and the client's (see ScreenGrid).
        <DndContext id={`group-grid-${groupSetupId}`} sensors={canArrange ? sensors : []} onDragEnd={handleDragEnd}>
          {Array.from({ length: rows * cols }, (_, slot) => {
            const row = Math.floor(slot / cols);
            const col = slot % cols;
            const screenId = bySlot.get(slot);
            const member = screenId !== undefined ? members.get(screenId) : undefined;
            return (
              <Cell
                key={slot}
                slot={slot}
                left={col * (cellWidth + GAP)}
                top={rowTops[row]}
                width={cellWidth}
                height={rowHeights[row]}
              >
                {member && (
                  <Monitor
                    member={member}
                    outOfSync={member.screen.live_setup_id !== groupSetupId}
                    width={cellWidth}
                    height={rowHeights[row]}
                    mediaById={mediaById}
                    fitMode={fitOverride ?? member.screen.fit_mode}
                    paused={paused}
                    draggable={canArrange}
                    onOpen={handleOpen}
                  />
                )}
              </Cell>
            );
          })}
        </DndContext>
      )}
    </div>
  );
}

function Cell({
  slot,
  left,
  top,
  width,
  height,
  children,
}: {
  slot: number;
  left: number;
  top: number;
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id: `cell-${slot}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute flex items-start justify-center rounded-[var(--radius-sm)] transition-colors",
        // While something's being dragged, every cell shows where it could go.
        active && "outline outline-1 outline-dashed outline-border",
        isOver && "bg-accent/10 outline-accent",
      )}
      style={{ left, top, width, height }}
    >
      {children}
    </div>
  );
}

function Monitor({
  member,
  outOfSync,
  width,
  height,
  mediaById,
  fitMode,
  paused,
  draggable,
  onOpen,
}: {
  member: GroupMemberView;
  outOfSync: boolean;
  width: number;
  height: number;
  mediaById: Map<string, MediaItem>;
  fitMode: ScreenGroup["fit_mode"];
  paused: boolean;
  draggable: boolean;
  onOpen: () => void;
}) {
  const { screen, playlist, status } = member;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: screen.id,
    disabled: !draggable,
  });

  // The frame keeps the screen's own shape — upright for one mounted at
  // 90° or 270° — as large as fits above its name.
  const portrait = screen.rotation === 90 || screen.rotation === 270;
  const aspect = portrait ? 9 / 16 : 16 / 9;
  const room = Math.max(0, height - LABEL_HEIGHT);
  const frameWidth = Math.min(width, room * aspect);
  const frameHeight = frameWidth / aspect;
  const border = Math.max(1.5, Math.min(frameWidth, frameHeight) * BORDER_RATIO);
  // A screen's own pause shows on its own monitor; the group's button only
  // claims "paused" when all of them are.
  const memberPaused = status?.online ? status.paused : paused;

  return (
    <div
      ref={setNodeRef}
      className={cn("flex flex-col items-center", isDragging && "relative z-20")}
      style={{ width, transform: CSS.Translate.toString(transform) }}
    >
      <button
        type="button"
        onClick={onOpen}
        {...attributes}
        {...listeners}
        aria-label={`${screen.name} — open the group's playback menu`}
        className={cn(
          "no-press relative block overflow-hidden bg-black",
          draggable && "cursor-grab",
          isDragging && "cursor-grabbing",
        )}
        style={{
          width: frameWidth,
          height: frameHeight,
          border: `${border}px solid #2e2e2e`,
          boxShadow: isDragging ? "var(--shadow-sheet)" : "-1px 3px 6px -2px rgba(0, 0, 0, 0.9)",
        }}
      >
        <ScreenPreview
          screen={screen}
          playlist={playlist}
          status={status}
          mediaById={mediaById}
          fitMode={fitMode}
          paused={memberPaused}
          width={frameWidth - border * 2}
          height={frameHeight - border * 2}
        />
      </button>
      <span
        title={outOfSync ? `${screen.name} is playing something other than this group's setup` : screen.name}
        className={cn(
          "mt-0.5 block w-full truncate text-center text-[10px] leading-[14px] text-muted",
          outOfSync && "sync-blink",
        )}
      >
        {screen.name}
      </span>
    </div>
  );
}
