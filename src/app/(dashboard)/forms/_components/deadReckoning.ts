// Follows someone round the plan on foot, from where they said they were:
// each step moves them a stride along the compass heading. Both are rough
// (a stride varies, a compass indoors is pulled about by the building's
// steel), so rather than one position this keeps a cloud of guesses, each
// with its own stride and compass error. A guess that would walk through a
// wall can't be right and is dropped, replaced by a copy of one that
// didn't, so after a few turns and doorways the cloud settles on the
// strides and errors that fit the building — a particle filter. Where it
// sits is the estimate; how spread out it is, the accuracy.

// The walls, as straight segments on the plan (x1 y1 x2 y2, in its units),
// filed by the grid cells they cross so a step only checks the walls near
// it.
export type Walls = { segs: Float64Array; grid: Map<number, number[]> };

const CELL = 200; // plan units, about 3 m
const cellKey = (cx: number, cy: number) => (cx + 512) * 1024 + (cy + 512);

// The walls of a floor, from its plan as scripts/flatten-floorplan.mjs
// writes it: every straight line counts, but no curve (they're mostly
// doors' swings, drawn across the doorway, and round columns) and nothing
// see-through (markings on the floor).
export function parseWalls(svg: string): Walls {
  const segs: number[] = [];
  for (const group of svg.matchAll(/<g ([^>]*)>([\s\S]*?)<\/g>/g)) {
    if (group[1].includes("stroke-opacity")) continue;
    for (const path of group[2].matchAll(/\sd="([^"]+)"/g)) {
      const t = path[1].match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
      let cmd = "", x = 0, y = 0, sx = 0, sy = 0, i = 0;
      while (i < t.length) {
        if (/[A-Za-z]/.test(t[i])) {
          cmd = t[i++];
          if (cmd === "z" || cmd === "Z") {
            if (x !== sx || y !== sy) segs.push(x, y, sx, sy);
            x = sx;
            y = sy;
          }
        } else if (cmd === "M") {
          x = sx = +t[i];
          y = sy = +t[i + 1];
          i += 2;
          cmd = "l";
        } else if (cmd === "l") {
          const nx = x + +t[i], ny = y + +t[i + 1];
          segs.push(x, y, nx, ny);
          x = nx;
          y = ny;
          i += 2;
        } else if (cmd === "c") {
          x += +t[i + 4];
          y += +t[i + 5];
          i += 6;
        } else i++;
      }
    }
  }
  const grid = new Map<number, number[]>();
  for (let s = 0; s < segs.length; s += 4) {
    const [x1, y1, x2, y2] = [segs[s], segs[s + 1], segs[s + 2], segs[s + 3]];
    for (let cx = Math.floor(Math.min(x1, x2) / CELL); cx <= Math.floor(Math.max(x1, x2) / CELL); cx++) {
      for (let cy = Math.floor(Math.min(y1, y2) / CELL); cy <= Math.floor(Math.max(y1, y2) / CELL); cy++) {
        const k = cellKey(cx, cy);
        const list = grid.get(k);
        if (list) list.push(s);
        else grid.set(k, [s]);
      }
    }
  }
  return { segs: new Float64Array(segs), grid };
}

// Whether going straight from a to b runs through a wall.
function crosses(walls: Walls, ax: number, ay: number, bx: number, by: number) {
  const { segs, grid } = walls;
  const dx = bx - ax, dy = by - ay;
  for (let cx = Math.floor(Math.min(ax, bx) / CELL); cx <= Math.floor(Math.max(ax, bx) / CELL); cx++) {
    for (let cy = Math.floor(Math.min(ay, by) / CELL); cy <= Math.floor(Math.max(ay, by) / CELL); cy++) {
      for (const s of grid.get(cellKey(cx, cy)) ?? []) {
        const ex = segs[s + 2] - segs[s], ey = segs[s + 3] - segs[s + 1];
        const den = dx * ey - dy * ex;
        if (den === 0) continue;
        const fx = segs[s] - ax, fy = segs[s + 1] - ay;
        const t = (fx * ey - fy * ex) / den, u = (fx * dy - fy * dx) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
      }
    }
  }
  return false;
}

const COUNT = 400;
const STRIDE_M = 0.7;
const START_SPREAD_M = 0.8; // how sure someone is of where they tapped
const BIAS_DEG = 10; // how far off the compass may be, for good
const TURN_NOISE_DEG = 6; // and step to step
const STRIDE_SPREAD = 0.12; // a stride, ± this share, for good
const STRIDE_NOISE = 0.08; // and step to step
const MIN_RADIUS_M = 1.2;

// Normally distributed, mean 0 and spread 1.
function gauss() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

export type Fix = { x: number; y: number; radius: number };

export function createTracker(unitsPerMetre: number) {
  const xs = new Float64Array(COUNT), ys = new Float64Array(COUNT);
  const bias = new Float64Array(COUNT), stride = new Float64Array(COUNT);
  const nx = new Float64Array(COUNT), ny = new Float64Array(COUNT);
  const alive = new Uint8Array(COUNT);
  let walls: Walls | null = null;
  let placed = false;

  function place(x: number, y: number) {
    for (let i = 0; i < COUNT; i++) {
      xs[i] = x + gauss() * START_SPREAD_M * unitsPerMetre;
      ys[i] = y + gauss() * START_SPREAD_M * unitsPerMetre;
      bias[i] = gauss() * BIAS_DEG;
      stride[i] = 1 + gauss() * STRIDE_SPREAD;
    }
    placed = true;
  }

  // One step, heading this way: degrees clockwise from the plan's top.
  function step(headingDeg: number) {
    if (!placed) return;
    const reach = STRIDE_M * unitsPerMetre;
    let survivors = 0;
    for (let i = 0; i < COUNT; i++) {
      const a = ((headingDeg + bias[i] + gauss() * TURN_NOISE_DEG) * Math.PI) / 180;
      const len = reach * stride[i] * (1 + gauss() * STRIDE_NOISE);
      nx[i] = xs[i] + Math.sin(a) * len;
      ny[i] = ys[i] - Math.cos(a) * len;
      alive[i] = walls && crosses(walls, xs[i], ys[i], nx[i], ny[i]) ? 0 : 1;
      survivors += alive[i];
    }
    // Next to none got through: the walls don't explain this step (a door
    // the plan doesn't show, or the cloud's gone astray), so it's taken as
    // it came, walls or not, rather than losing everyone.
    const keepAll = survivors < COUNT * 0.05;
    const living: number[] = [];
    for (let i = 0; i < COUNT; i++) {
      if (keepAll || alive[i]) {
        xs[i] = nx[i];
        ys[i] = ny[i];
        living.push(i);
      }
    }
    if (keepAll) return;
    // The ones that walked into a wall start again as a copy of one that
    // didn't, nudged a little so the cloud doesn't collapse to a few.
    const jitter = 0.15 * unitsPerMetre;
    for (let i = 0; i < COUNT; i++) {
      if (alive[i]) continue;
      const j = living[Math.floor(Math.random() * living.length)];
      xs[i] = xs[j] + gauss() * jitter;
      ys[i] = ys[j] + gauss() * jitter;
      bias[i] = bias[j] + gauss();
      stride[i] = stride[j] * (1 + gauss() * 0.02);
    }
  }

  // Where the cloud is, and how far out most of it reaches from there.
  function fix(): Fix | null {
    if (!placed) return null;
    let mx = 0, my = 0;
    for (let i = 0; i < COUNT; i++) {
      mx += xs[i];
      my += ys[i];
    }
    mx /= COUNT;
    my /= COUNT;
    let spread = 0;
    for (let i = 0; i < COUNT; i++) spread += (xs[i] - mx) ** 2 + (ys[i] - my) ** 2;
    const radius = Math.max(1.5 * Math.sqrt(spread / COUNT), MIN_RADIUS_M * unitsPerMetre);
    return { x: mx, y: my, radius };
  }

  return {
    place,
    step,
    fix,
    setWalls(next: Walls | null) {
      walls = next;
    },
  };
}

export type Tracker = ReturnType<typeof createTracker>;

// Each floor's walls, read once from its plan.
const wallsCache = new Map<string, Promise<Walls | null>>();
export function loadWalls(src: string): Promise<Walls | null> {
  let walls = wallsCache.get(src);
  if (!walls) {
    walls = fetch(src)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then(parseWalls)
      .catch(() => {
        wallsCache.delete(src);
        return null;
      });
    wallsCache.set(src, walls);
  }
  return walls;
}
