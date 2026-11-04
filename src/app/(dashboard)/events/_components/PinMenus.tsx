"use client";

import type { ReactNode } from "react";
import {
  AKKREDITIERUNG_KIND,
  AREAS_SECTION,
  BARRIEREFREI,
  BRANDING,
  CATERING_SECTION,
  DRINKS_SECTION,
  ENTRANCES,
  GARDEROBE_KIND,
  GASTRO_SECTION,
  NOT_STEP_FREE,
  PARKING,
  ROOM_PINS,
  ROOM_REQUIREMENTS,
  SECURITY,
  WC_POSITIONS,
  WC_SERVICE,
  WAGENHALLE_EXKLUSIV,
  WAGENHALLE_NICHT_EXKLUSIV,
  parkingDatesKey,
  pinKey,
  sectionByKey,
} from "@/lib/checkliste";
import { cn } from "@/lib/utils/cn";
import { CheckIcon } from "@/components/icons/PlaybackIcons";
import { WheelchairIcon } from "@/components/icons/WheelchairIcon";
import type { ChecklistState } from "./checklistState";
import { ParkingDates } from "./ParkingDates";
import { MapCard } from "./VenueMap";

// How the venue map's standing pins tie into the open event's Checkliste.
// Most have a switch beside their title; while one's off, the title does
// the same as the switch. Of those, the ones with more to pick open as
// they're switched on, showing no arrow: once on, the title opens and
// closes them (as does a tap on the map, to close), and only the switch
// turns them off again:
// - A Kino, or Haustechnik K1: on ticks its Saal (or itself) under "Welche
//   Flächen sind interessant?"; open, the room requirements, picked per
//   room — the list's own option is ticked while any room has it, and
//   names the rooms that do.
// - Garderobe, Akkreditierung: on while their -art has an answer — Service
//   to begin with; open, Service, Selbst or TBD.
// - A WC: on makes it one of the event's WC positions; open, Service or
//   Selbst for cleaning during the event — one answer for every WC ("WC
//   Service / Reinigung", Ja or Nein). The Halle/Hof's carries a red
//   wheelchair while Barrierefrei is ticked: it isn't step-free.
// - Banner Outdoor: on hangs one up top ("Banner Outdoor Oben"); open, Oben
//   and Unten, either or both.
// - Küche, Main Bar: on ticks it under "Gastroflächen"; open, the Küche
//   what's planned for catering, the Main Bar the drinks. Anything done
//   with either scrolls the Checkliste to "Catering und Getränke".
// - Both Parkv.: on ticks their side's closure; open, the days it's
//   registered for, on a yellow calendar (ParkingDates).
// And with a switch alone: Sicherheit (Ja or Nein on "Security / Ordner"),
// both Eingänge (which the list keeps
// one of open — see withConsequences), Barrierefreiheit, Banner Indoor,
// Projektion Indoor, Halle Geteilt (the Wagenhalle nicht exklusiv, off
// exklusiv — shown only while that's a question, see hallSplitCase), the
// Galerie Bar (under "Gastroflächen"), the Galerie Fläche and the
// Zwischenebene (theirs under "Welche Flächen sind interessant?") and the
// DJ Position ("DJ / Partytechnik"). Technik's and the Telekollegen's
// titles scroll the Checkliste to Technik.
type PinLink =
  | { kind: "saal"; field: string }
  | { kind: "check"; field: string }
  | { kind: "parking"; field: string }
  | { kind: "yesno"; section: string }
  | { kind: "art"; section: string }
  | { kind: "wc"; field: string }
  | { kind: "outdoor"; fields: [string, string] }
  | { kind: "gastro"; field: string; section: string; leaveOut?: string[] }
  | { kind: "scroll"; category: string }
  | { kind: "split" };

const CATERING_CATEGORY = "catering-und-getraenke";

const PIN_LINKS: Record<string, PinLink> = {
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`kino-${i + 1}`, { kind: "saal", field: `${AREAS_SECTION}/saal-${i + 1}` }]),
  ),
  "banner-indoor": { kind: "check", field: `${BRANDING}/banner-indoor` },
  "projektion-indoor": { kind: "check", field: `${BRANDING}/projektion-indoor` },
  "banner-outdoor": {
    kind: "outdoor",
    fields: [`${BRANDING}/banner-outdoor-oben`, `${BRANDING}/banner-outdoor-unten`],
  },
  sicherheit: { kind: "yesno", section: SECURITY },
  "parken-kino": { kind: "parking", field: `${PARKING}/seite-kino` },
  "parken-bioco": { kind: "parking", field: `${PARKING}/seite-biocompany` },
  "eingang-gleimstr": { kind: "check", field: ENTRANCES[0] },
  "eingang-schoenhauser": { kind: "check", field: ENTRANCES[1] },
  barrierefreiheit: { kind: "check", field: BARRIEREFREI },
  garderobe: { kind: "art", section: GARDEROBE_KIND },
  akkreditierung: { kind: "art", section: AKKREDITIERUNG_KIND },
  "wc-halle-kino": { kind: "wc", field: `${WC_POSITIONS}/wc-halle-kino` },
  "wc-halle-hof": { kind: "wc", field: `${WC_POSITIONS}/wc-halle-hof` },
  "wc-kino": { kind: "wc", field: `${WC_POSITIONS}/wc-kino` },
  "wc-oben": { kind: "wc", field: `${WC_POSITIONS}/wc-oben` },
  kueche: {
    kind: "gastro",
    field: `${GASTRO_SECTION}/kueche`,
    section: CATERING_SECTION,
    leaveOut: ["Noch unklar", "Kein Catering geplant"],
  },
  "main-bar": { kind: "gastro", field: `${GASTRO_SECTION}/mainbar`, section: DRINKS_SECTION },
  "galerie-bar": { kind: "check", field: `${GASTRO_SECTION}/galerie-bar` },
  "galerie-flaeche": { kind: "check", field: `${AREAS_SECTION}/galerie` },
  zwischenebene: { kind: "check", field: `${AREAS_SECTION}/zwischenebene` },
  "dj-position-treppe": { kind: "check", field: "welche-technik-wird-benoetigt/dj-partytechnik" },
  technik: { kind: "scroll", category: "technik" },
  telekollegen: { kind: "scroll", category: "technik" },
  "haustechnik-k1": { kind: "saal", field: `${AREAS_SECTION}/haustechnik-k1` },
  "halle-geteilt": { kind: "split" },
};

// Whether a pin with a switch is switched on, by the event's answers —
// null for a pin with no switch (a name, or Technik).
export function pinIsOn(pinId: string, answer: (key: string) => true | string | null): boolean | null {
  const link = PIN_LINKS[pinId];
  if (!link) return null;
  const ticked = (key: string) => answer(key) === true;
  switch (link.kind) {
    case "saal":
    case "check":
    case "parking":
    case "wc":
    case "gastro":
      return ticked(link.field);
    case "outdoor":
      return link.fields.some(ticked);
    case "art":
      return (sectionByKey(link.section)?.fields ?? []).some((f) => ticked(f.key));
    case "yesno":
      return (sectionByKey(link.section)?.fields ?? []).some((f) => f.label === "Ja" && ticked(f.key));
    case "scroll":
      return null;
    case "split":
      return ticked(WAGENHALLE_NICHT_EXKLUSIV);
  }
}

// The answers a pin's card shows — a change to any of them from elsewhere
// (the Checkliste, say) is the pin's to show (see EventsView). The WCs'
// shared Service / Selbst is left out: changing it on one WC would bring
// out all the others.
export function pinAnswerKeys(pinId: string): string[] {
  const link = PIN_LINKS[pinId];
  if (!link) return [];
  switch (link.kind) {
    case "saal":
      return [link.field, ...(sectionByKey(ROOM_REQUIREMENTS)?.fields ?? []).map((f) => pinKey(pinId, f.key))];
    case "check":
    case "wc":
      return [link.field];
    case "parking":
      return [link.field, parkingDatesKey(link.field)];
    case "yesno":
    case "art":
      return (sectionByKey(link.section)?.fields ?? []).map((f) => f.key);
    case "outdoor":
      return link.fields;
    case "gastro":
      return [link.field, ...(sectionByKey(link.section)?.fields ?? []).map((f) => f.key)];
    case "scroll":
      return [];
    case "split":
      return [WAGENHALLE_EXKLUSIV, WAGENHALLE_NICHT_EXKLUSIV];
  }
}

// Shorter names for a room's own requirements than the list's plurals.
const ROOM_LABELS: Record<string, string> = {
  "Workshopräume": "Workshopraum",
  "Breakout Räume": "Breakoutraum",
};

type Patch = Record<string, true | null>;

// A standing pin's card, tied to the Checkliste as above — or, for a pin
// with no ties (or no event open to tie into), just its name.
export function LinkedPinCard({
  pin,
  state,
  open,
  onOpenChange,
  onShowCategory,
}: {
  pin: { id: string; title: string };
  // The open event's answers; none open, the pins are only names.
  state: ChecklistState | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowCategory: (categoryKey: string) => void;
}) {
  const link = PIN_LINKS[pin.id];
  const plain = <MapCard title={pin.title} open={false} onToggle={() => onOpenChange(false)} />;
  if (!state || !link) return plain;
  const { answer } = state;
  const ticked = (key: string) => answer(key) === true;
  // Anything done with a Küche or Main Bar pin brings the list along.
  const save = (patch: Patch) => {
    state.save(patch);
    if (link.kind === "gastro") onShowCategory(CATERING_CATEGORY);
  };

  if (link.kind === "scroll") {
    return (
      <MapCard title={pin.title} open={false} onToggle={() => {}} onTitlePress={() => onShowCategory(link.category)} />
    );
  }

  // A pin with nothing more to pick: its switch, and its title the same.
  const switchCard = (on: boolean | null, toggle: () => void) => (
    <MapCard
      title={pin.title}
      open={false}
      onToggle={toggle}
      onTitlePress={toggle}
      control={<Switch label={pin.title} value={on} onPress={toggle} />}
    />
  );

  if (link.kind === "check") {
    const on = ticked(link.field);
    return switchCard(on, () => save({ [link.field]: on ? null : true }));
  }

  // Halle Geteilt: on, the Wagenhalle's shared (nicht exklusiv); off, it's
  // taken whole (exklusiv) — the one unticks the other (withConsequences).
  if (link.kind === "split") {
    const on = ticked(WAGENHALLE_NICHT_EXKLUSIV);
    return switchCard(on, () => save({ [on ? WAGENHALLE_EXKLUSIV : WAGENHALLE_NICHT_EXKLUSIV]: true }));
  }

  if (link.kind === "yesno") {
    // Ja on, Nein off — and neither (or "Noch unklar") shown as off, but
    // faded, until it's been said.
    const section = sectionByKey(link.section);
    if (!section) return plain;
    const yes = section.fields.find((f) => f.label === "Ja")!.key;
    const no = section.fields.find((f) => f.label === "Nein")!.key;
    const value = ticked(yes) ? true : ticked(no) ? false : null;
    return switchCard(value, () => save({ [value ? no : yes]: true }));
  }

  // The rest open as they're switched on. Off, title and switch turn one on
  // and open it; on, the title opens or closes it, and the switch turns it
  // off (and closes it).
  const expandable = (
    on: boolean,
    turnOn: Patch,
    turnOff: Patch,
    content: ReactNode,
    extra?: { adornment?: ReactNode; openWidth?: number },
  ) => {
    const switchOn = () => {
      save(turnOn);
      onOpenChange(true);
    };
    const pressTitle = () => (on ? onOpenChange(!open) : switchOn());
    const pressSwitch = () => {
      if (!on) return switchOn();
      save(turnOff);
      onOpenChange(false);
    };
    return (
      <MapCard
        title={pin.title}
        open={open}
        onToggle={pressTitle}
        onTitlePress={pressTitle}
        arrow={false}
        adornment={extra?.adornment}
        openWidth={extra?.openWidth}
        control={<Switch label={pin.title} value={on} onPress={pressSwitch} />}
      >
        {content}
      </MapCard>
    );
  };

  if (link.kind === "saal") {
    const requirements = sectionByKey(ROOM_REQUIREMENTS)?.fields ?? [];
    // The list's own option stays ticked while another room has it.
    const elsewhere = (fieldKey: string) => ROOM_PINS.some((id) => id !== pin.id && ticked(pinKey(id, fieldKey)));
    const off: Patch = { [link.field]: null };
    for (const field of requirements) {
      if (!ticked(pinKey(pin.id, field.key))) continue;
      off[pinKey(pin.id, field.key)] = null;
      off[field.key] = elsewhere(field.key) || null;
    }
    return expandable(
      ticked(link.field),
      { [link.field]: true },
      off,
      <OptionList
        options={requirements.map((field) => {
          const key = pinKey(pin.id, field.key);
          return {
            key,
            label: ROOM_LABELS[field.label] ?? field.label,
            checked: ticked(key),
            onToggle: () => {
              const on = !ticked(key);
              save({ [key]: on || null, [field.key]: on || elsewhere(field.key) || null });
            },
          };
        })}
      />,
    );
  }

  if (link.kind === "parking") {
    return expandable(
      ticked(link.field),
      { [link.field]: true },
      { [link.field]: null },
      <ParkingDates side={link.field} state={state} className="pb-1" />,
      // As wide as the calendar needs: a week across, seven days.
      { openWidth: 312 },
    );
  }

  if (link.kind === "art") {
    const section = sectionByKey(link.section);
    if (!section) return plain;
    const fields = section.fields;
    return expandable(
      fields.some((f) => ticked(f.key)),
      { [fields[0].key]: true },
      Object.fromEntries(fields.map((f) => [f.key, null])),
      <OptionList
        round
        options={fields.map((field) => ({
          key: field.key,
          label: field.label,
          checked: ticked(field.key),
          // One answer, and always one while it's on: picking the one
          // picked already leaves it.
          onToggle: () => !ticked(field.key) && save({ [field.key]: true }),
        }))}
      />,
    );
  }

  if (link.kind === "wc") {
    const service = sectionByKey(WC_SERVICE)?.fields ?? [];
    const yes = service.find((f) => f.label === "Ja")?.key;
    const no = service.find((f) => f.label === "Nein")?.key;
    const flagged = ticked(BARRIEREFREI) && NOT_STEP_FREE.has(link.field);
    return expandable(
      ticked(link.field),
      { [link.field]: true },
      { [link.field]: null },
      yes && no ? (
        <OptionList
          round
          options={[
            { key: yes, label: "Service" },
            { key: no, label: "Selbst" },
          ].map((option) => ({
            ...option,
            checked: ticked(option.key),
            onToggle: () => save({ [option.key]: ticked(option.key) ? null : true }),
          }))}
        />
      ) : null,
      {
        adornment: flagged ? (
          <span title="Nicht barrierefrei" className="text-danger">
            <WheelchairIcon className="h-[18px] w-[18px]" />
          </span>
        ) : undefined,
      },
    );
  }

  if (link.kind === "outdoor") {
    const [top, bottom] = link.fields;
    return expandable(
      ticked(top) || ticked(bottom),
      { [top]: true },
      { [top]: null, [bottom]: null },
      <OptionList
        options={[
          { key: top, label: "Oben" },
          { key: bottom, label: "Unten" },
        ].map((option) => ({
          ...option,
          checked: ticked(option.key),
          onToggle: () => save({ [option.key]: ticked(option.key) ? null : true }),
        }))}
      />,
    );
  }

  // Küche, Main Bar.
  const section = sectionByKey(link.section);
  if (!section) return plain;
  return expandable(
    ticked(link.field),
    { [link.field]: true },
    { [link.field]: null },
    <OptionList
      round={section.single}
      options={section.fields
        .filter((field) => !link.leaveOut?.includes(field.label))
        .map((field) => ({
          key: field.key,
          label: field.label,
          checked: ticked(field.key),
          onToggle: () => save({ [field.key]: ticked(field.key) ? null : true }),
        }))}
    />,
  );
}

function TickBox({ checked, round = false, className }: { checked: boolean; round?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center border-2 transition-colors",
        round ? "rounded-full" : "rounded-[5px]",
        checked ? "border-accent bg-accent text-accent-contrast" : "border-muted/50",
        className,
      )}
    >
      {checked && <CheckIcon className="h-3 w-3" />}
    </span>
  );
}

// round: one answer only (the options are radios).
function OptionList({
  options,
  round = false,
}: {
  options: { key: string; label: ReactNode; checked: boolean; onToggle: () => void }[];
  round?: boolean;
}) {
  return (
    <ul className="-mx-1 flex flex-col">
      {options.map((option) => (
        <li key={option.key}>
          <button
            type="button"
            role={round ? "radio" : "checkbox"}
            aria-checked={option.checked}
            onClick={option.onToggle}
            className="press-ghost-fit flex w-full items-center gap-2.5 rounded-[var(--radius-sm,8px)] px-1 py-1.5 text-left text-[14px]"
          >
            <TickBox checked={option.checked} round={round} />
            <span className="min-w-0 flex-1">{option.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// An iOS-style switch. value null: not answered yet — shown off, faded.
function Switch({ label, value, onPress }: { label: string; value: boolean | null; onPress: () => void }) {
  const on = value === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value === null ? "mixed" : on}
      aria-label={label}
      onClick={onPress}
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
