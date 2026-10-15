"use client";

import { useState } from "react";
import { SegmentedSlider } from "./SegmentedSlider";
import { ENTRY_MODES, useVeranstaltung } from "./veranstaltung";
import { VeranstaltungForm } from "./VeranstaltungForm";
import { MapCard, VenueMap, type FloorPlan } from "./VenueMap";

// Colosseum Berlin, ground floor. Slimmed down from the architects' 15 MB
// export (every transform baked in, strokes merged per colour) — see
// public/venues/.
const COLOSSEUM_EG: FloorPlan = {
  src: "/venues/colosseum-eg.svg",
  width: 9519,
  height: 5253,
  // Not confirmed against the building yet: the plan's top edge is taken
  // as north until someone checks it on site.
  northDeg: 0,
};

// Where each of the form's places sits on the plan, as a fraction of its
// width and height. The main entrance is the bank of doors at the bottom
// right.
const SPOTS = {
  eingang: { u: 0.815, v: 0.885 },
};

// The Forms page: the checklist on one side (top on a phone, left on an
// iPad or desktop) and the venue map on the other. They're two ways into
// the same answers — a question with a place on the map has a card there,
// tapping its title in the list opens that card, and picking an answer on
// either side shows on both.
export function FormsView() {
  const [form, update] = useVeranstaltung();
  const [openSpot, setOpenSpot] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);

  function showSpot(id: string) {
    setOpenSpot(id);
    setFocus((f) => ({ id, nonce: (f?.nonce ?? 0) + 1 }));
  }

  const entry = ENTRY_MODES.find((m) => m.value === form.eingang);

  return (
    // Fills the page's scroll area edge to edge (undoing its padding): each
    // half scrolls or pans on its own instead.
    <div className="-mx-5 -my-6 flex h-[calc(100%+3rem)] flex-col md:flex-row">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-b border-border px-4 py-5 md:w-[420px] md:flex-none md:border-b-0 md:border-r md:px-5 md:py-6 lg:w-[460px]">
        <VeranstaltungForm value={form} onChange={update} openSpot={openSpot} onShowSpot={showSpot} />
      </div>

      <VenueMap
        className="min-h-0 flex-1"
        plan={COLOSSEUM_EG}
        focus={focus}
        onBackgroundTap={() => setOpenSpot(null)}
        spots={[
          {
            id: "eingang",
            ...SPOTS.eingang,
            node: (
              <MapCard
                title="Eingang"
                summary={entry?.label ?? null}
                open={openSpot === "eingang"}
                onToggle={() => setOpenSpot((s) => (s === "eingang" ? null : "eingang"))}
              >
                <SegmentedSlider
                  label="Eingang"
                  options={ENTRY_MODES}
                  value={form.eingang}
                  onChange={(eingang) => update({ eingang })}
                />
                <p className="mt-2.5 text-[13px] text-muted">{entry?.hint ?? "Noch nicht festgelegt"}</p>
              </MapCard>
            ),
          },
        ]}
      />
    </div>
  );
}
