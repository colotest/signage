// A group's monitors sit in a grid of cells numbered row by row from the
// top left (row * cols + col) — see screen_group_members.slot in 0030.

export const MAX_GRID = 12;

// A roughly square grid that holds `count` screens: as many columns as
// rows, or one more.
export function defaultGrid(count: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  return { rows, cols };
}

// Where each member lands when the grid goes from `oldCols` wide to
// rows × cols: members keep their row and column where they still fit;
// any that fall outside move into the free cells, in reading order. Shared
// by the server action and the tile's optimistic update, so the two agree.
export function regrid(slots: Map<number, number>, oldCols: number, rows: number, cols: number) {
  const placed = new Map<number, number>();
  const overflow: number[] = [];
  const bySlot = [...slots].sort((a, b) => a[1] - b[1]);
  for (const [screenId, slot] of bySlot) {
    const row = Math.floor(slot / oldCols);
    const col = slot % oldCols;
    if (row < rows && col < cols) placed.set(screenId, row * cols + col);
    else overflow.push(screenId);
  }
  const taken = new Set(placed.values());
  let next = 0;
  for (const screenId of overflow) {
    while (taken.has(next)) next++;
    placed.set(screenId, next);
    taken.add(next);
  }
  return placed;
}
