// Flattens the Affinity floor-plan export: bakes every <g transform> into
// absolute coordinates, rounds them, and merges all strokes of one look into
// a few <path>s with hairline (non-scaling) strokes — one for each cell of
// a coarse grid over the plan (see GRID below).
// Usage: node scripts/flatten-floorplan.mjs in.svg out.svg [precision]
// (SW=0.8 sets the stroke width in screen px). Prints the viewBox to put in
// the FloorPlan (width/height) on the Forms page.
import fs from "node:fs";

const [, , inPath, outPath, precArg] = process.argv;
const PREC = Number(precArg ?? 1);
const src = fs.readFileSync(inPath, "utf8");

const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const ID = [1, 0, 0, 1, 0, 0];
const f = 10 ** PREC;

const stack = [ID];
const buckets = new Map(); // key -> [{ d, x, y }], x/y where the part starts
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

function styleKey(style) {
  const get = (k) => (style.match(new RegExp(`(?:^|;)${k}:([^;]+)`)) || [])[1];
  const stroke = get("stroke") ?? "none";
  const fill = get("fill") ?? "black";
  return `${stroke}|${fill}`;
}

// Coordinates are kept as integers in 1/f units and written relative to the
// previous point (lowercase commands), which is what makes the file small.
const fmt = (q) => {
  let s = String(q / f);
  if (s.startsWith("0.")) s = s.slice(1);
  else if (s.startsWith("-0.")) s = "-" + s.slice(2);
  return s;
};
const join = (nums) => nums.map((n, k) => (k > 0 && !n.startsWith("-") ? " " : "") + n).join("");

function addPath(d, style, m) {
  const out = [];
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  let i = 0, cmd = null;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "Z") { out.push("z"); cx = sx; cy = sy; }
      continue;
    }
    const n = cmd === "C" ? 3 : 1;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const x = +tokens[i++], y = +tokens[i++];
      const X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
      minX = Math.min(minX, X); maxX = Math.max(maxX, X);
      minY = Math.min(minY, Y); maxY = Math.max(maxY, Y);
      pts.push([Math.round(X * f), Math.round(Y * f)]);
    }
    if (cmd === "M") {
      // Absolute moves keep each subpath independent of the one before.
      const [x, y] = pts[0];
      out.push("M" + join([fmt(x), fmt(y)]));
      cx = sx = x; cy = sy = y; cmd = "L";
    } else if (cmd === "L") {
      const [x, y] = pts[0];
      if (x === cx && y === cy) continue;
      out.push("l" + join([fmt(x - cx), fmt(y - cy)]));
      cx = x; cy = y;
    } else {
      out.push("c" + join(pts.flatMap(([x, y]) => [fmt(x - cx), fmt(y - cy)])));
      [cx, cy] = pts[2];
    }
  }
  // Drop paths that collapsed to a single point at this precision.
  if (out.length < 2) return;
  const key = styleKey(style);
  if (!buckets.has(key)) buckets.set(key, []);
  const [x0, y0] = out[0].slice(1).match(/-?\d*\.?\d+/g).map(Number);
  buckets.get(key).push({ d: out.join(""), x: x0, y: y0 });
}

const tagRe = /<(\/?)(g|path|rect|text)\b([^>]*?)(\/?)>/g;
let mt;
while ((mt = tagRe.exec(src))) {
  const [, close, name, attrs, selfClose] = mt;
  const attr = (k) => (attrs.match(new RegExp(`\\s${k}="([^"]*)"`)) || [])[1];
  if (name === "g") {
    if (close) { stack.pop(); continue; }
    const tf = attr("transform");
    let m = stack[stack.length - 1];
    if (tf) {
      const nums = tf.match(/matrix\(([^)]+)\)/)[1].split(",").map(Number);
      m = mul(m, nums);
    }
    if (!selfClose) stack.push(m);
    continue;
  }
  if (close) continue;
  const m = stack[stack.length - 1];
  const style = attr("style") ?? "";
  if (name === "path") addPath(attr("d"), style, m);
  else if (name === "rect") {
    const x = +attr("x"), y = +attr("y"), w = +attr("width"), h = +attr("height");
    addPath(`M${x},${y}L${x + w},${y}L${x + w},${y + h}L${x},${y + h}Z`, style, m);
  }
  // <text>: three stray "F" labels at sub-pixel size — dropped.
}

console.error("bounds", { minX, minY, maxX, maxY });
for (const [k, v] of buckets) console.error(k, v.length);

const pad = 40;
const vb = [minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad].map((v) => Math.round(v));
const COLORS = {
  black: "#1c1c1e",
  "rgb(127,127,127)": "#8e8e93",
  "rgb(0,191,255)": "#0a84ff",
  "rgb(0,255,255)": "#0a84ff",
};
// A browser draws the plan a tile at a time, and has to go over every
// segment of a path for each tile the path's bounds touch. As one path per
// colour that was all ~68k segments for every tile; split by where each
// part starts, a tile only goes over the cells around it. Same drawing, a
// fraction of the work (zooming in and out of the venue map got several
// times smoother).
const GRID = { cols: 12, rows: 7 };
const cellOf = ({ x, y }) => {
  const c = Math.floor(((x - vb[0]) / vb[2]) * GRID.cols);
  const r = Math.floor(((y - vb[1]) / vb[3]) * GRID.rows);
  return Math.min(Math.max(r, 0), GRID.rows - 1) * GRID.cols + Math.min(Math.max(c, 0), GRID.cols - 1);
};
let body = "";
const order = [...buckets.keys()].sort((a, b) => (a.startsWith("black") ? 1 : 0) - (b.startsWith("black") ? 1 : 0));
for (const key of order) {
  const [stroke, fill] = key.split("|");
  const col = COLORS[stroke] ?? "#1c1c1e";
  const fillCol = fill === "none" ? "none" : col;
  const cells = new Map();
  for (const part of buckets.get(key)) {
    const cell = cellOf(part);
    if (!cells.has(cell)) cells.set(cell, []);
    cells.get(cell).push(part.d);
  }
  // vector-effect isn't inherited, so it goes on every path; the colours
  // are, and sit on the group.
  body += `<g fill="${fillCol}" stroke="${col}">\n`;
  for (const cell of [...cells.keys()].sort((a, b) => a - b)) {
    body += `<path vector-effect="non-scaling-stroke" d="${cells.get(cell).join("")}"/>\n`;
  }
  body += `</g>\n`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" width="${vb[2]}" height="${vb[3]}" stroke-width="${process.env.SW ?? 0.8}" stroke-linecap="round" stroke-linejoin="round">\n${body}</svg>\n`;
fs.writeFileSync(outPath, svg);
console.error("wrote", outPath, (svg.length / 1024).toFixed(0) + "KB", "viewBox", vb.join(" "));
