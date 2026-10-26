import { pinKey } from "@/lib/checkliste";
import type { MapArea } from "@/lib/eventAreas";

// The venue's own highlighted areas, shown on the map while the Checkliste
// option they belong to is ticked for the event on show — standing, like
// the map's standing pins, rather than drawn on each event. Placed on
// events first and copied out: the Wagenhalle's cinema half from
// "K2 Party", its event half (the main shape and the room beside it) from
// "Audi Weihnachtsfeier".
export const LINKED_AREAS: { when: string; areas: MapArea[] }[] = [
  {
    when: pinKey("wagenhalle-kino", "selected"),
    areas: [
      {
        id: "venue:wagenhalle-kino",
        points: [
          { u: 0.3099, v: 0.1285 }, { u: 0.2992, v: 0.2688 }, { u: 0.3705, v: 0.2714 }, { u: 0.3711, v: 0.4309 },
          { u: 0.5847, v: 0.4412 }, { u: 0.5866, v: 0.3268 }, { u: 0.804, v: 0.3781 }, { u: 0.8533, v: 0.3397 },
          { u: 0.9977, v: 0.3941 }, { u: 0.9964, v: 0.3108 }, { u: 0.6171, v: 0.1292 }, { u: 0.6043, v: 0.2298 },
          { u: 0.5395, v: 0.2063 }, { u: 0.528, v: 0.3032 }, { u: 0.4769, v: 0.2875 }, { u: 0.4869, v: 0.1827 },
          { u: 0.3457, v: 0.1238 }, { u: 0.3418, v: 0.1589 },
        ],
      },
    ],
  },
  {
    when: pinKey("wagenhalle-event", "selected"),
    areas: [
      {
        id: "venue:wagenhalle-event",
        points: [
          { u: 0.3043, v: 0.1507 }, { u: 0.2977, v: 0.3153 }, { u: 0.2947, v: 0.4415 }, { u: 0.5854, v: 0.4466 },
          { u: 0.6145, v: 0.4232 }, { u: 0.6552, v: 0.42 }, { u: 0.7015, v: 0.3826 }, { u: 0.6717, v: 0.3426 },
          { u: 0.816, v: 0.359 }, { u: 0.7789, v: 0.4199 }, { u: 0.7576, v: 0.5469 }, { u: 0.7713, v: 0.6445 },
          { u: 0.8073, v: 0.7109 }, { u: 0.8661, v: 0.7527 }, { u: 0.8651, v: 0.7678 }, { u: 0.9952, v: 0.8307 },
          { u: 0.9946, v: 0.8961 }, { u: 0.8558, v: 0.8273 }, { u: 0.8559, v: 0.8405 }, { u: 0.7231, v: 0.903 },
          { u: 0.7121, v: 0.8883 }, { u: 0.7105, v: 0.8301 }, { u: 0.6815, v: 0.8039 }, { u: 0.6553, v: 0.7518 },
          { u: 0.6463, v: 0.6821 }, { u: 0.5735, v: 0.6788 }, { u: 0.5723, v: 0.6227 }, { u: 0.4793, v: 0.6202 },
          { u: 0.4796, v: 0.6831 }, { u: 0.1174, v: 0.6822 }, { u: 0.0282, v: 0.6827 }, { u: 0.0278, v: 0.6369 },
          { u: 0.0812, v: 0.6324 }, { u: 0.1559, v: 0.0468 }, { u: 0.275, v: 0.0941 }, { u: 0.2708, v: 0.1282 },
        ],
      },
      {
        id: "venue:wagenhalle-event-room",
        points: [
          { u: 0.2969, v: 0.3193 }, { u: 0.3682, v: 0.3202 }, { u: 0.3682, v: 0.4421 }, { u: 0.2964, v: 0.4428 },
        ],
      },
    ],
  },
];

// The standing areas to show, for an event's answers.
export function linkedAreas(answer: ((key: string) => true | string | null) | null): MapArea[] {
  if (!answer) return [];
  return LINKED_AREAS.filter((linked) => answer(linked.when) === true).flatMap((linked) => linked.areas);
}
