"use client";

import { useState } from "react";
import { GLITTER_TUNING, Glitter, type GlitterStats, type GlitterTuning } from "@/components/screenPages/Glitter";
import { GLITTER_DIALS as DIALS } from "@/components/screenPages/dials";

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
