// Draws a flattened floor plan (see flatten-floorplan.mjs) as pictures for
// the venue map, its lines on a clear background so floors can lie over
// one another:
// - out.webp: the plan for the map's "Pixel" setting, one pixel per unit
//   (lossless).
// - out-ghost.webp: the floor as it shows while another is picked — a
//   quarter of that, softened by GHOST_BLUR units. Blurred, it needs no
//   more pixels than that, and with the blur already in the picture the
//   map has no filter to run as it moves.
// Usage: node scripts/rasterize-floorplan.mjs plan.svg out (writes
// out.webp and out-ghost.webp)
import fs from "node:fs";
import sharp from "sharp";

const [, , inPath, outBase] = process.argv;
const svg = fs.readFileSync(inPath, "utf8");
const [, , width, height] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);

const GHOST_SCALE = 0.25;
const GHOST_BLUR = 7; // in the plan's units

function sized(scale) {
  const w = Math.round(width * scale), h = Math.round(height * scale);
  return Buffer.from(svg.replace(/width="[^"]*" height="[^"]*"/, `width="${w}" height="${h}"`));
}

// sharp's SVG reader caps the size it'll draw; this lifts it for the full one.
await sharp(sized(1), { limitInputPixels: false, unlimited: true })
  .webp({ lossless: true, effort: 6 })
  .toFile(`${outBase}.webp`);
await sharp(sized(GHOST_SCALE))
  .blur(GHOST_BLUR * GHOST_SCALE)
  .webp({ quality: 82, alphaQuality: 82, effort: 6 })
  .toFile(`${outBase}-ghost.webp`);
for (const f of [`${outBase}.webp`, `${outBase}-ghost.webp`]) {
  console.error("wrote", f, (fs.statSync(f).size / 1024).toFixed(0) + "KB");
}
