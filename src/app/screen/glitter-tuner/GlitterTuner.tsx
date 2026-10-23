"use client";

import { useState } from "react";
import { GLITTER_TUNING, Glitter, type GlitterStats, type GlitterTuning } from "@/components/screenPages/Glitter";

// Each dial, with the range worth exploring and how fine a step is useful.
// `note` is what the number does, so the panel explains itself a month from
// now when none of this is fresh any more.
const DIALS: { key: keyof GlitterTuning; label: string; min: number; max: number; step: number; note: string }[] = [
  { key: "cell", label: "Flake size", min: 0.0015, max: 0.012, step: 0.0001, note: "One flake's cell, as a fraction of the screen's short side. Smaller is a finer, denser cloud and more work for the shader. In the shader it moves in whole pixels." },
  { key: "resolution", label: "Resolution", min: 0.25, max: 1, step: 0.05, note: "WebGL only: the share of the device's pixels the shader works in. Half is a quarter of the cost; the browser's stretch softens each glint into a small bloom." },
  { key: "density", label: "Density", min: 0.1, max: 1, step: 0.01, note: "The share of cells holding a flake." },
  { key: "clouds", label: "Clouds", min: 0, max: 1, step: 0.01, note: "How patchy the cloud is: thicker and thinner stretches drifting through it. WebGL only." },
  { key: "spread", label: "Tilt spread", min: 0.1, max: 1.2, step: 0.01, note: "How far from flat the flakes lie. Wider scatters the glints over the whole screen; narrower gathers them round the hotspot. WebGL only." },
  { key: "sweep", label: "Hotspot", min: 0, max: 1.2, step: 0.01, note: "How tightly the glints gather where the light reflects. Zero is evenly all over. WebGL only." },
  { key: "sparkle", label: "Sparkle", min: 0.008, max: 0.1, step: 0.001, note: "How exactly a flake has to line up to flash. Smaller is rarer, briefer, sharper glints; larger is more and softer." },
  { key: "tumble", label: "Tumble", min: 0, max: 0.4, step: 0.005, note: "How far each flake turns as it floats. More turning is more flakes passing through a flash. WebGL only." },
  { key: "tumbleSpeed", label: "Tumble speed", min: 0.1, max: 4, step: 0.05, note: "How fast they turn — and so how short a flash is." },
  { key: "lightSpeed", label: "Light speed", min: 0, max: 10, step: 0.1, note: "How fast the light, and the hotspot with it, wanders." },
  { key: "drift", label: "Float speed", min: 0, max: 20, step: 0.1, note: "How fast the cloud floats about and eddies." },
  { key: "bed", label: "Bed", min: 0, max: 0.8, step: 0.005, note: "The dim glitter that is always there, between flashes." },
  { key: "gain", label: "Flash", min: 0.2, max: 10, step: 0.05, note: "How bright a flash gets at its strongest." },
  { key: "falloff", label: "Rarity of bright", min: 0.5, max: 8, step: 0.1, note: "Higher leaves most flashes faint and only a few strong." },
  { key: "holo", label: "Holographic", min: 0, max: 1, step: 0.01, note: "The share of flakes that run through the colours rather than flashing silver." },
  { key: "far", label: "Far layer", min: 0, max: 1.5, step: 0.01, note: "How bright the finer cloud behind is." },
  { key: "big", label: "Big flakes", min: 0, max: 1, step: 0.01, note: "WebGL only: how many of the big near flakes there are — the ones that bloom and throw a cross when they flash." },
  { key: "glints", label: "Glints (canvas)", min: 5, max: 300, step: 1, note: "Canvas only: glints born a second, per square of the short side." },
  { key: "fps", label: "Frame cap", min: 10, max: 60, step: 1, note: "Frames a second at most." },
  { key: "silverHue", label: "Silver hue", min: 0, max: 360, step: 1, note: "The warmth in the silver." },
  { key: "purpleHue", label: "Purple hue", min: 0, max: 360, step: 1, note: "One end of the holographic run." },
  { key: "orangeHue", label: "Orange hue", min: 0, max: 360, step: 1, note: "The middle of the holographic run." },
  { key: "greenHue", label: "Green hue", min: 0, max: 360, step: 1, note: "The other end of the holographic run." },
];

export function GlitterTuner() {
  const [tuning, setTuning] = useState<GlitterTuning>(GLITTER_TUNING);
  const [renderer, setRenderer] = useState<"auto" | "canvas">("auto");
  const [stats, setStats] = useState<GlitterStats | null>(null);
  const [open, setOpen] = useState(true);
  const changed = DIALS.filter(({ key }) => tuning[key] !== GLITTER_TUNING[key]);

  // What to paste back into Glitter.tsx — only the dials actually moved.
  const summary = changed.length
    ? changed.map(({ key, label }) => `${label}: ${round(tuning[key])}  (was ${round(GLITTER_TUNING[key])})`).join("\n")
    : "Nothing changed yet.";

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-black">
      <Glitter tuning={tuning} renderer={renderer} onStats={setStats} />

      <div className="absolute left-4 top-4 z-10 w-[300px] rounded-[14px] border border-white/15 bg-black/70 text-white backdrop-blur-xl">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[13px] font-medium tracking-tight">Glitter</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-white/50">
              {stats ? `${stats.renderer} · ${stats.fps} fps` : "…"}
            </span>
            <button
              type="button"
              onClick={() => setTuning(GLITTER_TUNING)}
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
            <div className="mt-3 flex gap-1 text-[11px]">
              {(["auto", "canvas"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRenderer(option)}
                  className={`flex-1 rounded-full px-2 py-1 ${renderer === option ? "bg-white/20 text-white" : "text-white/60 hover:bg-white/10"}`}
                >
                  {option === "auto" ? "WebGL if it can" : "Canvas only"}
                </button>
              ))}
            </div>

            {DIALS.map(({ key, label, min, max, step, note }) => (
              <label key={key} title={note} className="mt-3 block">
                <span className="flex items-baseline justify-between text-[11px]">
                  <span className={tuning[key] === GLITTER_TUNING[key] ? "text-white/70" : "text-amber-300"}>{label}</span>
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
  return Math.round(value * 10000) / 10000;
}
