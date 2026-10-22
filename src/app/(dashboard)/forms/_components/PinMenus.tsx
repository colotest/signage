"use client";

import type { ReactNode } from "react";
import { ROOM_PINS, ROOM_REQUIREMENTS, WAGENHALLE_PINS, pinKey, sectionByKey } from "@/lib/checkliste";
import { cn } from "@/lib/utils/cn";
import { CheckIcon } from "@/components/icons/PlaybackIcons";
import type { ChecklistState } from "./checklistState";
import { MapCard } from "./VenueMap";

// How the venue map's standing pins tie into the open event's Checkliste:
// - A Kino: its title ticks the like-numbered Saal under "Welche Flächen
//   sind interessant?" (the box beside it shows that same answer).
// - A Wagenhalle hall: its title ticks the hall; both ticked is
//   "Wagenhalle exklusiv", one alone "Wagenhalle nicht exklusiv".
// - Either, opened: the room requirements, picked per room — the list's own
//   option is ticked while any room has it.
// - Gastro, opened: "Catering geplant", one to one; its title scrolls the
//   Checkliste to "Catering und Getränke".
// - Garderobe, Parken, Sicherheit: a switch for Ja / Nein on their
//   question, and opened, a way back to no answer at all.
type PinLink =
  | { kind: "saal"; field: string }
  | { kind: "wagenhalle" }
  | { kind: "options"; section: string; category: string }
  | { kind: "switch"; section: string };

const AREAS = "welche-flaechen-sind-interessant";
const EXKLUSIV = `${AREAS}/wagenhalle-exklusiv`;
const NICHT_EXKLUSIV = `${AREAS}/wagenhalle-nicht-exklusiv`;

const PIN_LINKS: Record<string, PinLink> = {
  "kino-2": { kind: "saal", field: `${AREAS}/saal-2` },
  "kino-3": { kind: "saal", field: `${AREAS}/saal-3` },
  "kino-4": { kind: "saal", field: `${AREAS}/saal-4` },
  "kino-5": { kind: "saal", field: `${AREAS}/saal-5` },
  "wagenhalle-kino": { kind: "wagenhalle" },
  "wagenhalle-event": { kind: "wagenhalle" },
  gastro: { kind: "options", section: "catering-geplant", category: "catering-und-getraenke" },
  garderobe: { kind: "switch", section: "garderobe-benoetigt" },
  parken: { kind: "switch", section: "parkplatzsperrung-ladezone-benoetigt" },
  sicherheit: { kind: "switch", section: "security-ordner-benoetigt" },
};

// Shorter names for a room's own requirements than the list's plurals.
const ROOM_LABELS: Record<string, string> = {
  "Workshopräume": "Workshopraum",
  "Breakout Räume": "Breakoutraum",
};

// A standing pin's card, tied to the Checkliste as above — or, for a pin
// with no ties (or no event open to tie into), just its name.
export function LinkedPinCard({
  pin,
  state,
  open,
  onToggle,
  onShowCategory,
}: {
  pin: { id: string; title: string };
  // The open event's answers; none open, the pins are only names.
  state: ChecklistState | null;
  open: boolean;
  onToggle: () => void;
  onShowCategory: (categoryKey: string) => void;
}) {
  const link = PIN_LINKS[pin.id];
  if (!state || !link) return <MapCard title={pin.title} open={false} onToggle={onToggle} />;
  const { answer, save } = state;
  const ticked = (key: string) => answer(key) === true;

  if (link.kind === "saal" || link.kind === "wagenhalle") {
    const selectedKey = link.kind === "saal" ? link.field : pinKey(pin.id, "selected");
    const toggleSelected = () => {
      if (link.kind === "saal") return save({ [link.field]: ticked(link.field) ? null : true });
      const on = !ticked(selectedKey);
      const count = WAGENHALLE_PINS.filter((id) => (id === pin.id ? on : ticked(pinKey(id, "selected")))).length;
      save({ [selectedKey]: on || null, [EXKLUSIV]: count === 2 || null, [NICHT_EXKLUSIV]: count === 1 || null });
    };
    const requirements = sectionByKey(ROOM_REQUIREMENTS)?.fields ?? [];
    return (
      <MapCard
        title={pin.title}
        open={open}
        onToggle={onToggle}
        onTitlePress={toggleSelected}
        adornment={<TickBox checked={ticked(selectedKey)} />}
      >
        <OptionList
          options={requirements.map((field) => ({
            key: pinKey(pin.id, field.key),
            label: ROOM_LABELS[field.label] ?? field.label,
            checked: ticked(pinKey(pin.id, field.key)),
            onToggle: () => {
              const on = !ticked(pinKey(pin.id, field.key));
              const elsewhere = ROOM_PINS.some((id) => id !== pin.id && ticked(pinKey(id, field.key)));
              save({ [pinKey(pin.id, field.key)]: on || null, [field.key]: on || elsewhere || null });
            },
          }))}
        />
      </MapCard>
    );
  }

  const section = sectionByKey(link.section);
  if (!section) return <MapCard title={pin.title} open={false} onToggle={onToggle} />;

  if (link.kind === "options") {
    return (
      <MapCard title={pin.title} open={open} onToggle={onToggle} onTitlePress={() => onShowCategory(link.category)}>
        <OptionList
          options={section.fields.map((field) => ({
            key: field.key,
            label: field.label,
            checked: ticked(field.key),
            onToggle: () => save({ [field.key]: ticked(field.key) ? null : true }),
          }))}
        />
      </MapCard>
    );
  }

  // A switch: Ja on, Nein off — and neither (or "Noch unklar") shown as off,
  // but faded, until it's been said.
  const yes = section.fields.find((f) => f.label === "Ja")!.key;
  const no = section.fields.find((f) => f.label === "Nein")!.key;
  const value = ticked(yes) ? true : ticked(no) ? false : null;
  return (
    <MapCard
      title={pin.title}
      open={open}
      onToggle={onToggle}
      control={
        <Switch
          label={section.title}
          value={value}
          onChange={(on) => save({ [on ? yes : no]: true })}
        />
      }
    >
      <button
        type="button"
        onClick={() => save(Object.fromEntries(section.fields.map((f) => [f.key, null])))}
        disabled={section.fields.every((f) => !ticked(f.key))}
        className="w-full rounded-full bg-[var(--control-fill)] px-3 py-1.5 text-[14px] font-medium hover:bg-[var(--control-fill-hover)] disabled:opacity-40"
      >
        Zurücksetzen
      </button>
    </MapCard>
  );
}

function TickBox({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors",
        checked ? "border-accent bg-accent text-accent-contrast" : "border-muted/50",
        className,
      )}
    >
      {checked && <CheckIcon className="h-3 w-3" />}
    </span>
  );
}

function OptionList({
  options,
}: {
  options: { key: string; label: ReactNode; checked: boolean; onToggle: () => void }[];
}) {
  return (
    <ul className="-mx-1 flex flex-col">
      {options.map((option) => (
        <li key={option.key}>
          <button
            type="button"
            role="checkbox"
            aria-checked={option.checked}
            onClick={option.onToggle}
            className="press-ghost-fit flex w-full items-center gap-2.5 rounded-[var(--radius-sm,8px)] px-1 py-1.5 text-left text-[14px]"
          >
            <TickBox checked={option.checked} />
            <span className="min-w-0 flex-1">{option.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// An iOS-style switch. value null: not answered yet — shown off, faded.
function Switch({ label, value, onChange }: { label: string; value: boolean | null; onChange: (on: boolean) => void }) {
  const on = value === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value === null ? "mixed" : on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "no-press relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200",
        on ? "bg-[#34c759]" : "bg-black/15 dark:bg-white/20",
        value === null && "opacity-50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-200",
          on && "translate-x-4",
        )}
      />
    </button>
  );
}
