"use client";

import { useEffect, useState, useTransition } from "react";
import { listScreenDevices, pairScreenDevice, unpairScreenDevice, type PairedDevice } from "@/lib/actions/screenDevices";

// The wrench menu's TVs: the ones paired with this screen, and pairing
// another — type in the code it shows. A TV that's already playing this
// screen (not paired yet) can be asked to show one.
export function ScreenPairing({ screenId, onShowCode }: { screenId: number; onShowCode: () => void }) {
  const [devices, setDevices] = useState<PairedDevice[] | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listScreenDevices(screenId)
      .then((list) => !cancelled && setDevices(list))
      .catch(() => !cancelled && setDevices([]));
    return () => {
      cancelled = true;
    };
  }, [screenId]);

  function refresh() {
    listScreenDevices(screenId).then(setDevices).catch(() => {});
  }

  function handlePair(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await pairScreenDevice(screenId, code);
      if (result.error) {
        setError(result.error);
        return;
      }
      setCode("");
      setNotice("Paired — the TV switches over in a few seconds.");
      // The TV makes its device on its next check, a couple of seconds on.
      setTimeout(refresh, 4000);
    });
  }

  function handleUnpair(deviceId: string) {
    startTransition(async () => {
      await unpairScreenDevice(screenId, deviceId);
      setDevices((current) => current?.filter((device) => device.id !== deviceId) ?? null);
    });
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-1.5 text-[11px] text-muted">Paired TVs</p>
      {devices === null ? (
        <p className="text-[12px] text-muted">…</p>
      ) : devices.length === 0 ? (
        <p className="text-[12px] text-muted">None yet</p>
      ) : (
        <ul className="space-y-1">
          {devices.map((device) => (
            <li key={device.id} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="min-w-0 truncate text-foreground">
                {device.label ?? "TV"}
                <span className="text-muted"> · {seen(device.lastSeenAt ?? device.createdAt)}</span>
              </span>
              <button
                type="button"
                onClick={() => handleUnpair(device.id)}
                disabled={pending}
                className="press-ghost shrink-0 font-medium text-danger hover:opacity-70"
              >
                Unpair
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handlePair} className="mt-2 flex items-center gap-1.5">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="Code on the TV"
          aria-label="Pairing code shown on the TV"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={9}
          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-transparent px-2 py-1 font-mono text-[12px] tracking-wider text-foreground placeholder:font-sans placeholder:tracking-normal placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={pending || !code.trim()}
          className="press-ghost shrink-0 text-[13px] font-medium text-accent hover:opacity-70 disabled:opacity-40"
        >
          Pair
        </button>
      </form>
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
      {notice && <p className="mt-1 text-[11px] text-muted">{notice}</p>}
      <button
        type="button"
        onClick={() => {
          onShowCode();
          setNotice("Asked the TV playing this screen to show a code.");
        }}
        title="Puts a pairing code over whatever this screen's TV is showing"
        className="press-ghost mt-2 block text-[12px] text-muted hover:text-foreground"
      >
        Show code on TV
      </button>
    </div>
  );
}

function seen(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
