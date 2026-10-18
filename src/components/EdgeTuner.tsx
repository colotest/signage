"use client";

import { useEffect, useState } from "react";
import {
  EDGE_FIELDS,
  EDGE_PRESETS,
  applyTuning,
  loadTuning,
  onOpenEdgeTuner,
  presetDefault,
  tuningCss,
  varName,
  type EdgeValues,
} from "@/lib/edgeTuning";
import { cn } from "@/lib/utils/cn";

// A floating panel for tuning the scroll-edge presets live, on real lists:
// every slider rewrites one preset value across the whole app as it moves.
// Tuned values stick on this device until reset; "Copy CSS" puts them on the
// clipboard, to be written back into globals.css. Opened from the account
// menu (admins), or with ?tune-edges in the address.
export function EdgeTuner() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<EdgeValues>({});
  const [preset, setPreset] = useState<string>(EDGE_PRESETS[0].key);
  const [copied, setCopied] = useState(false);

  // Tuning from an earlier visit applies from the start, panel open or not.
  useEffect(() => {
    const stored = loadTuning();
    applyTuning(stored);
    // Read once on mount: the stored values aren't React state until here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues(stored);
    if (new URLSearchParams(window.location.search).has("tune-edges")) setOpen(true);
    return onOpenEdgeTuner(() => setOpen(true));
  }, []);

  if (!open) return null;

  function update(next: EdgeValues) {
    setValues(next);
    applyTuning(next);
  }

  function valueOf(field: string) {
    const name = varName(preset, field);
    return values[name] ?? presetDefault(preset, field);
  }

  return (
    <div className="glass-material fixed bottom-4 left-4 z-[90] flex max-h-[70dvh] w-[300px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border text-[13px] shadow-[var(--shadow-float)]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <p className="font-semibold">Scroll edges</p>
        <button type="button" onClick={() => setOpen(false)} className="press-ghost text-accent">
          Done
        </button>
      </div>

      <div className="flex gap-1 px-3 pt-3">
        {EDGE_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(p.key)}
            className={cn(
              "press-ghost-fit flex-1 rounded-full py-1 font-medium",
              preset === p.key ? "bg-[var(--control-fill)] text-foreground" : "text-muted",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="px-4 pt-1.5 text-[11px] text-muted">{EDGE_PRESETS.find((p) => p.key === preset)?.hint}</p>

      <div className="flex-1 overflow-y-auto px-4 pb-2 pt-2">
        {EDGE_FIELDS.map((field) => {
          const name = varName(preset, field.key);
          const value = valueOf(field.key);
          const tuned = values[name] !== undefined;
          return (
            <label key={field.key} className="block py-1.5">
              <span className="flex items-baseline justify-between">
                <span className="font-medium">{field.label}</span>
                <span className={cn("tabular-nums", tuned ? "text-accent" : "text-muted")}>{value}px</span>
              </span>
              <input
                type="range"
                min={0}
                max={field.max}
                step={"step" in field ? field.step : 1}
                value={value}
                onChange={(e) => update({ ...values, [name]: Number(e.target.value) })}
                className="mt-1 w-full accent-[var(--accent)]"
              />
              <span className="block text-[11px] text-muted">{field.hint}</span>
            </label>
          );
        })}
      </div>

      <div className="flex gap-2 border-t border-border px-4 py-2.5">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(tuningCss(values)).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => window.prompt("Copy these values:", tuningCss(values)),
            );
          }}
          className="flex-1 rounded-full bg-[var(--control-fill)] py-1.5 font-medium"
        >
          {copied ? "Copied ✓" : "Copy CSS"}
        </button>
        <button
          type="button"
          onClick={() => update({})}
          className="flex-1 rounded-full bg-[var(--control-fill)] py-1.5 font-medium text-danger"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
