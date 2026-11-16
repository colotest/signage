"use client";

import { useEffect, useState } from "react";

const POLL_MS = 2500;

// What a TV shows to be paired with a screen: a code, to type into that
// screen's wrench menu on the dashboard (see src/app/screen/pair/route.ts).
// Once it's been entered, the TV goes to its screen's player — keeping
// ?app=, so the Fire TV app's player stays its own. A code that runs out
// is swapped for a fresh one.
//
// Either the whole screen (a TV that isn't paired), or a panel over a
// screen that's playing, when asked for from the dashboard ("overlay").
export function PairingCode({ overlay = false, onClose }: { overlay?: boolean; onClose?: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      try {
        const response = await fetch("/screen/pair", { method: "POST", cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const { code } = (await response.json()) as { code: string };
        if (cancelled) return;
        setCode(code);
        setFailed(false);
        timer = setTimeout(poll, POLL_MS);
      } catch {
        if (cancelled) return;
        setFailed(true);
        timer = setTimeout(start, 10_000);
      }
    }

    async function poll() {
      try {
        const response = await fetch("/screen/pair", { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 410) return start();
        const result = (await response.json()) as { status: string; screenId?: number };
        if (result.status === "paired" && result.screenId !== undefined) {
          window.location.replace(`/screen/${result.screenId}${window.location.search}`);
          return;
        }
      } catch {
        // Offline for a moment: keep asking.
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }

    start();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const shown = code ? `${code.slice(0, 3)} ${code.slice(3)}` : "··· ···";

  return (
    <div
      className={
        overlay
          ? "fixed inset-0 z-50 flex items-center justify-center bg-black/80 text-white"
          : "flex h-dvh w-dvw items-center justify-center bg-black text-white"
      }
    >
      <div className="flex flex-col items-center gap-[3vmin] px-[6vmin] text-center">
        <p className="text-[3.2vmin] text-white/60">Pair this TV with a screen</p>
        <p className="font-mono text-[14vmin] font-semibold tracking-[0.12em] tabular-nums">{shown}</p>
        <p className="max-w-[70vmin] text-[2.6vmin] leading-snug text-white/50">
          {failed
            ? "Can't reach the server — trying again…"
            : "On the dashboard, open the screen's wrench menu and enter this code under Paired TVs."}
        </p>
        {overlay && onClose && (
          <button type="button" onClick={onClose} className="mt-[2vmin] text-[2.4vmin] text-white/40 hover:text-white/70">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
