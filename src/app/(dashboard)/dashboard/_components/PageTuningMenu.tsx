"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Menu } from "@/components/ui/Menu";
import { SlidersIcon } from "@/components/icons/SlidersIcon";
import { TUNABLE_PAGES, type TunablePage } from "@/components/screenPages/dials";
import type { ControlMessage } from "@/lib/realtime/channels";
import { cn } from "@/lib/utils/cn";

// A slider moves far faster than a screen needs telling, and Realtime only
// takes so many messages a second from one client before it starts
// dropping them. Every message carries the whole set, so sending the
// latest at most this often loses nothing.
const SEND_EVERY_MS = 120;

// The dials of the page a screen is showing (Glitter, the Lava Lamp),
// turned live: each change goes straight to the screen over its control
// channel, as play and pause do. Nothing is saved on the screen's side —
// the page's own defaults come back when its player reloads — so what's
// been set is kept here, in this browser, and sent again whenever the
// panel opens.
export function PageTuningMenu({
  screenId,
  page,
  send,
}: {
  screenId: number;
  page: TunablePage;
  send: (message: ControlMessage) => void;
}) {
  const { name, defaults, dials } = TUNABLE_PAGES[page];
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  // What was last set from this browser, until something is set now. Read
  // as an outside store: the server has none, so it renders the defaults,
  // and the browser's copy comes in on hydration without a mismatch.
  const storedRaw = useSyncExternalStore(
    noSubscription,
    () => read(storageKey(screenId, page)),
    () => null,
  );
  const stored = useMemo(() => parse(page, storedRaw), [page, storedRaw]);
  const [edited, setEdited] = useState<Record<string, number> | null>(null);
  const tuning = edited ?? { ...defaults, ...stored };
  const [copied, setCopied] = useState(false);

  const pendingRef = useRef<Record<string, number> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSentRef = useRef(0);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  function push(next: Record<string, number>) {
    pendingRef.current = next;
    if (timerRef.current) return;
    timerRef.current = setTimeout(flush, Math.max(0, lastSentRef.current + SEND_EVERY_MS - Date.now()));
  }

  function flush() {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    const next = pendingRef.current;
    pendingRef.current = null;
    if (!next) return;
    lastSentRef.current = Date.now();
    sendRef.current({ type: "tune", page, tuning: next });
  }

  // Whatever's still waiting goes out on the way down, rather than being
  // lost to a closing tile.
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function change(next: Record<string, number>) {
    setEdited(next);
    save(screenId, page, next);
    push(next);
  }

  function toggle() {
    if (open) return setOpen(false);
    // A screen that has reloaded since has its defaults back; this puts
    // what was set here back on it.
    push(tuning);
    setOpen(true);
  }

  const changed = dials.filter(({ key }) => tuning[key] !== defaults[key]);
  const summary = changed
    .map(({ key, label }) => `${label}: ${round(tuning[key])}  (was ${round(defaults[key])})`)
    .join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${name}\n${summary}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard (an insecure origin, a refused permission): the list
      // is on screen to copy by hand.
    }
  }

  return (
    <div className="shrink-0">
      <button
        ref={anchorRef}
        type="button"
        onClick={toggle}
        title={`Tune ${name}`}
        aria-label={`Tune ${name}`}
        aria-expanded={open}
        className={cn(
          "press-ghost-fit rounded-full p-1.5 transition-colors hover:text-foreground",
          changed.length ? "text-accent" : "text-muted",
        )}
      >
        <SlidersIcon className="h-4 w-4" />
      </button>

      <Menu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        align="start"
        dragSelect={false}
        role="dialog"
        aria-label={`Tune ${name}`}
        className="flex max-h-[min(560px,calc(100dvh-32px))] w-72 flex-col p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-[13px] font-semibold">{name}</span>
          <button
            type="button"
            onClick={() => change({ ...defaults })}
            disabled={!changed.length}
            className="press-ghost-fit rounded-full px-2 py-0.5 text-[12px] text-muted hover:text-foreground disabled:opacity-40"
          >
            Reset
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {dials.map(({ key, label, min, max, step, note }) => (
            <label key={key} title={note} className="mt-3 block">
              <span className="flex items-baseline justify-between text-[11px]">
                <span className={tuning[key] === defaults[key] ? "text-muted" : "font-medium text-accent"}>{label}</span>
                <span className="font-mono tabular-nums text-muted">{round(tuning[key])}</span>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={tuning[key]}
                onChange={(e) => change({ ...tuning, [key]: Number(e.target.value) })}
                className="mt-1 w-full accent-[var(--accent)]"
              />
            </label>
          ))}
        </div>

        <div className="border-t border-border px-3 py-2">
          <p className="text-[11px] leading-snug text-muted">
            Live on this screen until it reloads. To keep a look, copy the changes and have them made the
            defaults.
          </p>
          {changed.length > 0 && (
            <button
              type="button"
              onClick={copy}
              className="press-ghost-fit mt-2 w-full rounded-full bg-black/[.05] py-1 text-[12px] font-medium text-foreground shadow-[var(--shadow-control)] hover:bg-black/[.08] dark:bg-white/[.08] dark:hover:bg-white/[.12]"
            >
              {copied ? "Copied" : `Copy ${changed.length} change${changed.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </Menu>
    </div>
  );
}

// Kept per screen and page in this browser, so the panel opens on what was
// last set rather than on the defaults. Storage can be missing or refuse
// (a private window); the panel just starts from the defaults then.
function storageKey(screenId: number, page: TunablePage) {
  return `page-tuning:${screenId}:${page}`;
}

function noSubscription() {
  return () => {};
}

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse(page: TunablePage, raw: string | null): Record<string, number> {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    // Only dials that still exist, and only numbers.
    const known = TUNABLE_PAGES[page].defaults;
    return Object.fromEntries(
      Object.entries(parsed).filter(([key, value]) => key in known && typeof value === "number" && Number.isFinite(value)),
    );
  } catch {
    return {};
  }
}

function save(screenId: number, page: TunablePage, tuning: Record<string, number>) {
  try {
    window.localStorage.setItem(storageKey(screenId, page), JSON.stringify(tuning));
  } catch {
    // See read.
  }
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}
