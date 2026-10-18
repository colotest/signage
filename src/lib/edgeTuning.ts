// The scroll-edge tuning panel's model (see EdgeTuner): every preset value
// from "Scroll windows' edges" in globals.css, with a range to slide it
// over. Tuned values override the presets on <html> (inline, so they beat
// the stylesheet) and are remembered on this device until reset.
export const EDGE_PRESETS = [
  { key: "title", label: "Title", hint: "Under a page or section title" },
  { key: "toolbar", label: "Toolbar", hint: "The page's bottom edge, behind Safari's toolbar" },
  { key: "plain", label: "Plain", hint: "Facing another list" },
] as const;

export const EDGE_FIELDS = [
  { key: "tuck", label: "Tuck", max: 120, hint: "How far it reaches in under what's beside it" },
  { key: "size", label: "Edge depth", max: 160, hint: "How deep the blur and wash go" },
  { key: "fade", label: "Content fade", max: 120, hint: "How far content itself fades out" },
  { key: "clear", label: "Clear room", max: 160, hint: "Room before the first row at rest" },
  { key: "hold", label: "Hold", max: 80, hint: "How deep it stays at full strength" },
  { key: "blur", label: "Blur", max: 40, step: 0.5, hint: "The strongest blur, at the hard edge" },
] as const;

export type EdgeValues = Record<string, number>;

const STORAGE_KEY = "signage:edge-tuning";
const OPEN_EVENT = "signage:open-edge-tuner";

export const varName = (preset: string, field: string) => `--edge-${preset}-${field}`;

// The stylesheet's own value for a variable, ignoring any tuning on <html>.
export function presetDefault(preset: string, field: string) {
  const root = document.documentElement;
  const name = varName(preset, field);
  const tuned = root.style.getPropertyValue(name);
  root.style.removeProperty(name);
  const value = parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0;
  if (tuned) root.style.setProperty(name, tuned);
  return value;
}

export function loadTuning(): EdgeValues {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as EdgeValues;
  } catch {
    return {};
  }
}

export function applyTuning(values: EdgeValues) {
  const root = document.documentElement;
  for (const { key: preset } of EDGE_PRESETS) {
    for (const { key: field } of EDGE_FIELDS) {
      const name = varName(preset, field);
      const value = values[name];
      if (value === undefined) root.style.removeProperty(name);
      else root.style.setProperty(name, `${value}px`);
    }
  }
  try {
    if (Object.keys(values).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the tuning still applies for this visit.
  }
}

// The tuned values as CSS, ready to paste over the presets.
export function tuningCss(values: EdgeValues) {
  const lines = Object.entries(values).map(([name, value]) => `  ${name}: ${value}px;`);
  return lines.length ? `:root {\n${lines.join("\n")}\n}` : "/* No changes from the presets. */";
}

export function openEdgeTuner() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onOpenEdgeTuner(listener: () => void) {
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}
