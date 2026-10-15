"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { SegmentedSlider } from "./SegmentedSlider";
import {
  DURATIONS,
  ENTRY_MODES,
  EVENT_TYPES,
  GUESTS_MAX,
  type EventType,
  type Veranstaltung,
} from "./veranstaltung";

// The list side of the Forms page: the 'Veranstaltung' checklist, one row
// per question, each ticked off once it has an answer. Rows that have a
// place on the venue map (so far, Eingang) have a title you can tap to open
// that place's card on the map.
export function VeranstaltungForm({
  value,
  onChange,
  openSpot,
  onShowSpot,
}: {
  value: Veranstaltung;
  onChange: (patch: Partial<Veranstaltung>) => void;
  openSpot: string | null;
  onShowSpot: (id: string) => void;
}) {
  const answered = [value.typ !== null, value.gaeste > 0, value.dauer !== null, value.eingang !== null];
  const doneCount = answered.filter(Boolean).length;

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h1 className="text-[28px] font-semibold tracking-tight">Veranstaltung</h1>
        <span className="text-[13px] tabular-nums text-muted">
          {doneCount} von {answered.length}
        </span>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-card)]">
        <Row title="Typ" done={answered[0]}>
          <div role="radiogroup" aria-label="Typ" className="grid grid-cols-3 gap-2">
            {EVENT_TYPES.map((type) => {
              const selected = value.typ === type.value;
              return (
                <button
                  key={type.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChange({ typ: selected ? null : type.value })}
                  className={cn(
                    "flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] text-[14px] font-medium transition-colors duration-200",
                    selected
                      ? "bg-accent text-accent-contrast shadow-[var(--shadow-control)]"
                      : "bg-black/[.04] text-foreground shadow-[var(--shadow-well)] dark:bg-white/[.06]",
                  )}
                >
                  <EventTypeIcon type={type.value} className="h-7 w-7" />
                  {type.label}
                </button>
              );
            })}
          </div>
        </Row>

        <Row title="Gästezahl" done={answered[1]}>
          <GuestStepper value={value.gaeste} onChange={(gaeste) => onChange({ gaeste })} />
        </Row>

        <Row title="Dauer" done={answered[2]}>
          <SegmentedSlider
            label="Dauer"
            options={DURATIONS}
            value={value.dauer}
            onChange={(dauer) => onChange({ dauer })}
          />
        </Row>

        <Row
          done={answered[3]}
          title={
            <button
              type="button"
              onClick={() => onShowSpot("eingang")}
              aria-label="Eingang auf der Karte zeigen"
              className={cn(
                "no-press -mx-1.5 -my-1 flex items-center gap-1 rounded-full px-1.5 py-1 transition-colors hover:bg-accent/10",
                openSpot === "eingang" ? "text-accent" : "text-foreground",
              )}
            >
              Eingang
              <MapPinIcon className={cn("h-4 w-4", openSpot === "eingang" ? "text-accent" : "text-muted")} />
            </button>
          }
        >
          <SegmentedSlider
            label="Eingang"
            options={ENTRY_MODES}
            value={value.eingang}
            onChange={(eingang) => onChange({ eingang })}
          />
        </Row>
      </div>
    </div>
  );
}

function Row({ title, done, children }: { title: ReactNode; done: boolean; children: ReactNode }) {
  return (
    <section className="px-4 pb-4 pt-3">
      <div className="mb-2.5 flex items-center gap-2 text-[15px] font-semibold">
        <CheckDot done={done} />
        {title}
      </div>
      {children}
    </section>
  );
}

function CheckDot({ done }: { done: boolean }) {
  return (
    <span
      aria-label={done ? "Erledigt" : "Offen"}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
        done ? "bg-success text-white" : "border-[1.5px] border-muted/50",
      )}
    >
      {done && (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3.2">
          <polyline points="5 12.5 10 17.5 19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

const STEP = 10;
// Holding − or + repeats, speeding up the longer it's held.
const REPEAT_DELAY_MS = 380;
const REPEAT_EVERY_MS = 70;

function GuestStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  // What's in the field while it's being typed in — kept apart from the
  // value so clearing it to type a new number doesn't snap back to 0.
  const [draft, setDraft] = useState<string | null>(null);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const clamp = (n: number) => Math.min(Math.max(Math.round(n), 0), GUESTS_MAX);

  const repeatRef = useRef<{ timer: ReturnType<typeof setTimeout>; ticks: number } | null>(null);
  function step(direction: 1 | -1) {
    const ticks = repeatRef.current?.ticks ?? 0;
    const size = ticks > 20 ? STEP * 10 : STEP;
    // Lands on a whole step first (47 → 50), then moves by whole steps.
    const current = valueRef.current;
    const next = direction > 0 ? Math.floor(current / size) * size + size : Math.ceil(current / size) * size - size;
    valueRef.current = clamp(next);
    onChange(valueRef.current);
  }
  function startRepeat(direction: 1 | -1) {
    stopRepeat();
    step(direction);
    const tick = () => {
      step(direction);
      repeatRef.current = { timer: setTimeout(tick, REPEAT_EVERY_MS), ticks: (repeatRef.current?.ticks ?? 0) + 1 };
    };
    repeatRef.current = { timer: setTimeout(tick, REPEAT_DELAY_MS), ticks: 0 };
  }
  function stopRepeat() {
    if (repeatRef.current) clearTimeout(repeatRef.current.timer);
    repeatRef.current = null;
  }
  useEffect(() => stopRepeat, []);

  const button = (direction: 1 | -1) => (
    <button
      type="button"
      aria-label={direction > 0 ? `${STEP} mehr` : `${STEP} weniger`}
      disabled={direction > 0 ? value >= GUESTS_MAX : value <= 0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        startRepeat(direction);
      }}
      onPointerUp={stopRepeat}
      onPointerCancel={stopRepeat}
      onLostPointerCapture={stopRepeat}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          step(direction);
        }
      }}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/[.05] text-foreground shadow-[var(--shadow-control)] transition-opacity disabled:opacity-35 dark:bg-white/[.1]"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="5" y1="12" x2="19" y2="12" />
        {direction > 0 && <line x1="12" y1="5" x2="12" y2="19" />}
      </svg>
    </button>
  );

  return (
    <div className="flex items-center gap-3">
      {button(-1)}
      <label className="flex min-w-0 flex-1 flex-col items-center">
        <input
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          aria-label="Gästezahl"
          value={draft ?? String(value)}
          onFocus={(e) => {
            setDraft(value === 0 ? "" : String(value));
            requestAnimationFrame(() => e.target.select());
          }}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 5);
            setDraft(digits);
            onChange(clamp(Number(digits || 0)));
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="0"
          className={cn(
            "w-full bg-transparent text-center text-[34px] font-semibold tabular-nums tracking-tight outline-none",
            value === 0 && draft === null && "text-muted",
          )}
        />
        <span className="-mt-1 text-[12px] text-muted">Gäste</span>
      </label>
      {button(1)}
    </div>
  );
}

function EventTypeIcon({ type, className }: { type: EventType; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (type === "tagung")
    // A lectern with a microphone.
    return (
      <svg {...common}>
        <path d="M6 10h12l-1.5 10h-9z" />
        <path d="M4.5 10h15" />
        <path d="M12 10V6.5" />
        <circle cx="12" cy="5" r="1.5" />
      </svg>
    );
  if (type === "premiere")
    // A clapperboard.
    return (
      <svg {...common}>
        <rect x="3.5" y="9.5" width="17" height="10.5" rx="1.5" />
        <path d="M3.5 9.5 19 5.4 18.2 3 3 7z" />
        <path d="m8 4.7 2.4 3.6M13 3.4l2.4 3.6" />
      </svg>
    );
  // A market stall with an awning.
  return (
    <svg {...common}>
      <path d="M4 9.5 5.5 4h13L20 9.5" />
      <path d="M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.1 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5" />
      <path d="M5.5 12v8h13v-8" />
      <path d="M10 20v-4.5h4V20" />
    </svg>
  );
}

export function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}
