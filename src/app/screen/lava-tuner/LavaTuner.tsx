"use client";

import { useState } from "react";
import { LAVA_TUNING, LavaLamp, type LavaTuning } from "@/components/screenPages/LavaLamp";

// Each dial, with the range worth exploring and how fine a step is useful.
// `note` is what the number does, so the panel explains itself a month from
// now when none of this is fresh any more.
const DIALS: { key: keyof LavaTuning; label: string; min: number; max: number; step: number; note: string }[] = [
  { key: "stage", label: "Stage", min: 0.1, max: 0.5, step: 0.01, note: "Filter resolution, as a fraction of the screen. The biggest lever on cost." },
  { key: "blur", label: "Merge reach", min: 0.01, max: 0.12, step: 0.002, note: "How far apart two blobs reach for each other, and how much a merge swells." },
  { key: "blobAlpha", label: "Blob height", min: 0.25, max: 1, step: 0.01, note: "How high one blob stands in the field. Only the headroom under 1 can be added to, so this is how far a merge can swell: at 1 none, at 0.5 two blobs can sum, at 0.33 three. Lower it and blobs shrink too, unless you take Edge level down with it." },
  { key: "cut", label: "Edge level", min: 0.08, max: 0.6, step: 0.01, note: "Where the edge is cut, up the field. Half of Blob height puts it exactly where blobs are drawn; lower leaves them larger than drawn and reaching further for each other." },
  { key: "alphaGain", label: "Edge hardness", min: 4, max: 60, step: 1, note: "How few pixels an edge takes to go from nothing to solid." },
  { key: "lift", label: "Light band", min: 0.005, max: 0.08, step: 0.002, note: "How wide the lit edge is. Narrow reads as gloss, wide as a dipped blob." },
  { key: "rimStrength", label: "Light strength", min: 0, max: 14, step: 0.2, note: "How bright the lit edges are, top and bottom together." },
  { key: "rimFocus", label: "Gloss focus", min: 0.6, max: 3, step: 0.05, note: "Above 1 concentrates the light into a sheen; 1 is a flat band." },
  { key: "topLight", label: "Light from above", min: 0, max: 1.5, step: 0.05, note: "The upper light, as a fraction of the one below it." },
  { key: "haloStrength", label: "Translucence", min: 0, max: 1, step: 0.02, note: "The glow outside the edge and the light inside it, together." },
  { key: "density", label: "Wax density", min: 0, max: 1.6, step: 0.05, note: "How much thick wax swallows light — the dark through a blob's middle." },
  { key: "speed", label: "Slowness", min: 0.3, max: 3, step: 0.05, note: "Multiplies every drift's duration. Above 1 is slower." },
  { key: "waxHue", label: "Wax hue", min: 0, max: 360, step: 1, note: "The one colour every blob is, before the vessel's light reaches it." },
  { key: "waxSaturation", label: "Wax saturation", min: 0, max: 100, step: 1, note: "How far from grey that colour sits." },
  { key: "waxLightness", label: "Wax lightness", min: 20, max: 80, step: 0.5, note: "How bright it is at the bottom of the vessel, before anything darkens it." },
  { key: "rampDepth", label: "Gradient depth", min: 0, max: 1.8, step: 0.05, note: "How far into the vessel's dark a blob sinks as it rises. Zero is one flat colour top to bottom." },
  { key: "rampStart", label: "Gradient start", min: 0, max: 0.7, step: 0.02, note: "How far up the screen the darkening begins. Higher keeps the lower half at full strength." },
  { key: "lightDrop", label: "Light drop", min: -6, max: 22, step: 1, note: "How far below the bottom edge the bulb's centre sits, in percent of the height." },
];

export function LavaTuner() {
  const [tuning, setTuning] = useState<LavaTuning>(LAVA_TUNING);
  const [open, setOpen] = useState(true);
  const changed = DIALS.filter(({ key }) => tuning[key] !== LAVA_TUNING[key]);

  // What to paste back into LavaLamp.tsx — only the dials actually moved,
  // so there's no hunting through a dump of unchanged defaults.
  const summary = changed.length
    ? changed.map(({ key, label }) => `${label}: ${round(tuning[key])}  (was ${round(LAVA_TUNING[key])})`).join("\n")
    : "Nothing changed yet.";

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-black">
      <LavaLamp tuning={tuning} />

      <div className="absolute left-4 top-4 w-[300px] rounded-[14px] border border-white/15 bg-black/70 text-white backdrop-blur-xl">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[13px] font-medium tracking-tight">Lava Lamp</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTuning(LAVA_TUNING)}
              className="rounded-full px-2 py-0.5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-full px-2 py-0.5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
            >
              {open ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {open && (
          <div className="max-h-[80vh] overflow-y-auto border-t border-white/10 px-3 pb-3">
            {DIALS.map(({ key, label, min, max, step, note }) => (
              <label key={key} title={note} className="mt-3 block">
                <span className="flex items-baseline justify-between text-[11px]">
                  <span className={tuning[key] === LAVA_TUNING[key] ? "text-white/70" : "text-amber-300"}>{label}</span>
                  <span className="font-mono text-white/50">{round(tuning[key])}</span>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={tuning[key]}
                  onChange={(e) => setTuning((current) => ({ ...current, [key]: Number(e.target.value) }))}
                  className="mt-1 w-full accent-amber-400"
                />
              </label>
            ))}

            <pre className="mt-4 whitespace-pre-wrap rounded-[8px] bg-white/5 p-2 text-[10px] leading-relaxed text-white/60">
              {summary}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
