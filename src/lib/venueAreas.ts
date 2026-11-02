import {
  ENTRANCES,
  MAINBAR,
  UPSTAIRS,
  WC_HALLE_HOF,
  WC_HALLE_KINO,
  ZWISCHENEBENE,
  hallSplit,
  saal,
} from "@/lib/checkliste";
import type { MapArea } from "@/lib/eventAreas";

// The venue's own highlighted areas — which part of the building an event
// takes up, worked out from what's switched on for it (see linkedAreas).
// Drawn as an untitled event's areas, in this order, and copied out; named
// as they were handed over: HU, H, HO, S and HOG on the ground floor, the
// two ground-floor ways up for the upper floor (by the Gleimstraße and by
// the Schönhauser entrance), ZW and HZW on the mezzanine, and the upper
// floor's own — and, drawn on the "Halle" event afterwards, one more on
// the ground floor for the upper floor without the Halle's cinema side.
const AREAS = {
  HU: {
    id: "venue:hu",
    floor: "eg",
    points: [
      { u: 0.1467, v: 0.3219 }, { u: 0.2143, v: 0.3499 }, { u: 0.2119, v: 0.3732 }, { u: 0.2311, v: 0.3808 },
      { u: 0.2186, v: 0.4572 }, { u: 0.2263, v: 0.4839 }, { u: 0.2677, v: 0.4838 }, { u: 0.2684, v: 0.5605 },
      { u: 0.3892, v: 0.5594 }, { u: 0.3998, v: 0.5506 }, { u: 0.4104, v: 0.5469 }, { u: 0.4236, v: 0.5472 },
      { u: 0.4427, v: 0.5399 }, { u: 0.447, v: 0.5337 }, { u: 0.4551, v: 0.5219 }, { u: 0.5113, v: 0.5214 },
      { u: 0.5007, v: 0.54 }, { u: 0.4916, v: 0.5693 }, { u: 0.4868, v: 0.6095 }, { u: 0.4877, v: 0.6404 },
      { u: 0.4934, v: 0.6741 }, { u: 0.5025, v: 0.6985 }, { u: 0.514, v: 0.7192 }, { u: 0.5268, v: 0.7298 },
      { u: 0.5487, v: 0.7422 }, { u: 0.5417, v: 0.7936 }, { u: 0.4794, v: 0.8284 }, { u: 0.4671, v: 0.8345 },
      { u: 0.4604, v: 0.824 }, { u: 0.4602, v: 0.7895 }, { u: 0.4494, v: 0.7819 }, { u: 0.4353, v: 0.759 },
      { u: 0.4263, v: 0.7328 }, { u: 0.4235, v: 0.7013 }, { u: 0.3951, v: 0.7013 }, { u: 0.395, v: 0.6697 },
      { u: 0.3948, v: 0.6653 }, { u: 0.3825, v: 0.6632 }, { u: 0.3821, v: 0.6664 }, { u: 0.33, v: 0.6664 },
      { u: 0.3287, v: 0.7026 }, { u: 0.1249, v: 0.7021 }, { u: 0.1246, v: 0.6662 }, { u: 0.1054, v: 0.6663 },
    ],
  },
  H: {
    id: "venue:h",
    floor: "eg",
    points: [
      { u: 0.1053, v: 0.6678 }, { u: 0.1465, v: 0.3208 }, { u: 0.215, v: 0.3501 }, { u: 0.2121, v: 0.373 },
      { u: 0.2502, v: 0.3897 }, { u: 0.2533, v: 0.3675 }, { u: 0.3352, v: 0.4038 }, { u: 0.3279, v: 0.4647 },
      { u: 0.3562, v: 0.4773 }, { u: 0.363, v: 0.4162 }, { u: 0.4148, v: 0.4397 }, { u: 0.4189, v: 0.4091 },
      { u: 0.4381, v: 0.4191 }, { u: 0.443, v: 0.3918 }, { u: 0.5875, v: 0.4664 }, { u: 0.5813, v: 0.5091 },
      { u: 0.5618, v: 0.4986 }, { u: 0.5443, v: 0.4978 }, { u: 0.5244, v: 0.5075 }, { u: 0.5068, v: 0.5292 },
      { u: 0.4949, v: 0.5582 }, { u: 0.4871, v: 0.6071 }, { u: 0.4874, v: 0.6387 }, { u: 0.4943, v: 0.6764 },
      { u: 0.5042, v: 0.702 }, { u: 0.5184, v: 0.7234 }, { u: 0.5361, v: 0.737 }, { u: 0.5483, v: 0.7421 },
      { u: 0.5418, v: 0.7901 }, { u: 0.5426, v: 0.7963 }, { u: 0.467, v: 0.8333 }, { u: 0.4608, v: 0.824 },
      { u: 0.4607, v: 0.7894 }, { u: 0.4461, v: 0.7763 }, { u: 0.4369, v: 0.7616 }, { u: 0.4271, v: 0.7356 },
      { u: 0.4233, v: 0.7115 }, { u: 0.4232, v: 0.6993 }, { u: 0.3953, v: 0.6993 }, { u: 0.3952, v: 0.6639 },
      { u: 0.3299, v: 0.6651 }, { u: 0.3295, v: 0.7007 }, { u: 0.1246, v: 0.7017 }, { u: 0.1247, v: 0.665 },
    ],
  },
  HO: {
    id: "venue:ho",
    floor: "eg",
    points: [
      { u: 0.2316, v: 0.3822 }, { u: 0.2189, v: 0.4561 }, { u: 0.2678, v: 0.4566 }, { u: 0.2676, v: 0.56 },
      { u: 0.3882, v: 0.5575 }, { u: 0.3849, v: 0.5207 }, { u: 0.3893, v: 0.4851 }, { u: 0.3993, v: 0.4938 },
      { u: 0.3978, v: 0.4912 }, { u: 0.4297, v: 0.4971 }, { u: 0.4427, v: 0.5052 }, { u: 0.4551, v: 0.5224 },
      { u: 0.5083, v: 0.5267 }, { u: 0.5263, v: 0.506 }, { u: 0.5393, v: 0.4993 }, { u: 0.5548, v: 0.4978 },
      { u: 0.5821, v: 0.5099 }, { u: 0.5879, v: 0.4665 }, { u: 0.4432, v: 0.3928 }, { u: 0.4387, v: 0.4202 },
      { u: 0.4186, v: 0.4095 }, { u: 0.4149, v: 0.44 }, { u: 0.3629, v: 0.4166 }, { u: 0.3563, v: 0.4763 },
      { u: 0.3282, v: 0.4651 }, { u: 0.3352, v: 0.4028 }, { u: 0.2533, v: 0.3668 }, { u: 0.2504, v: 0.3888 },
    ],
  },
  S: {
    id: "venue:s",
    floor: "eg",
    points: [
      { u: 0.5886, v: 0.4681 }, { u: 0.9207, v: 0.64 }, { u: 0.9146, v: 0.6816 }, { u: 0.8846, v: 0.6675 },
      { u: 0.8771, v: 0.743 }, { u: 0.8363, v: 0.7193 }, { u: 0.8462, v: 0.6437 }, { u: 0.5831, v: 0.5087 },
    ],
  },
  HOG: {
    id: "venue:hog",
    floor: "eg",
    points: [
      { u: 0.231, v: 0.3819 }, { u: 0.2186, v: 0.4562 }, { u: 0.2679, v: 0.457 }, { u: 0.2674, v: 0.5591 },
      { u: 0.3297, v: 0.5566 }, { u: 0.3323, v: 0.6688 }, { u: 0.3949, v: 0.6699 }, { u: 0.3952, v: 0.7022 },
      { u: 0.4234, v: 0.7018 }, { u: 0.4247, v: 0.7263 }, { u: 0.4311, v: 0.7482 }, { u: 0.4409, v: 0.7689 },
      { u: 0.4516, v: 0.782 }, { u: 0.4606, v: 0.7886 }, { u: 0.4607, v: 0.8248 }, { u: 0.4676, v: 0.8338 },
      { u: 0.5433, v: 0.7956 }, { u: 0.5418, v: 0.7882 }, { u: 0.5482, v: 0.7418 }, { u: 0.5252, v: 0.729 },
      { u: 0.5099, v: 0.7112 }, { u: 0.4986, v: 0.6885 }, { u: 0.4889, v: 0.6509 }, { u: 0.4865, v: 0.6138 },
      { u: 0.4914, v: 0.5724 }, { u: 0.4972, v: 0.5505 }, { u: 0.4546, v: 0.5238 }, { u: 0.4371, v: 0.5419 },
      { u: 0.4179, v: 0.5471 }, { u: 0.4026, v: 0.5478 }, { u: 0.3896, v: 0.5576 }, { u: 0.3852, v: 0.5232 },
      { u: 0.3904, v: 0.4869 }, { u: 0.4033, v: 0.4948 }, { u: 0.4239, v: 0.4968 }, { u: 0.4419, v: 0.5035 },
      { u: 0.4556, v: 0.5212 }, { u: 0.4985, v: 0.548 }, { u: 0.5095, v: 0.5238 }, { u: 0.5308, v: 0.5036 },
      { u: 0.5495, v: 0.4973 }, { u: 0.5664, v: 0.5011 }, { u: 0.5817, v: 0.5093 }, { u: 0.588, v: 0.4657 },
      { u: 0.4414, v: 0.3906 }, { u: 0.4382, v: 0.4167 }, { u: 0.4185, v: 0.4074 }, { u: 0.4142, v: 0.4373 },
      { u: 0.3634, v: 0.4163 }, { u: 0.3568, v: 0.4763 }, { u: 0.3287, v: 0.4648 }, { u: 0.336, v: 0.4007 },
      { u: 0.2539, v: 0.3673 }, { u: 0.2498, v: 0.3899 },
    ],
  },
  GLEIM_OG: {
    id: "venue:gleim-og",
    floor: "eg",
    points: [
      { u: 0.5429, v: 0.7976 }, { u: 0.5416, v: 0.7881 }, { u: 0.5479, v: 0.7427 }, { u: 0.5221, v: 0.7267 },
      { u: 0.5038, v: 0.7004 }, { u: 0.4926, v: 0.6686 }, { u: 0.4876, v: 0.6371 }, { u: 0.4877, v: 0.5948 },
      { u: 0.4973, v: 0.5496 }, { u: 0.5115, v: 0.5207 }, { u: 0.4551, v: 0.5242 }, { u: 0.4477, v: 0.5357 },
      { u: 0.4233, v: 0.5481 }, { u: 0.4081, v: 0.5472 }, { u: 0.4154, v: 0.5412 }, { u: 0.3902, v: 0.4856 },
      { u: 0.3643, v: 0.5028 }, { u: 0.3489, v: 0.5387 }, { u: 0.3488, v: 0.5881 }, { u: 0.3488, v: 0.6666 },
      { u: 0.3955, v: 0.667 }, { u: 0.3956, v: 0.7003 }, { u: 0.4237, v: 0.7012 }, { u: 0.4261, v: 0.7297 },
      { u: 0.4388, v: 0.7646 }, { u: 0.4609, v: 0.7911 }, { u: 0.4616, v: 0.8213 }, { u: 0.468, v: 0.8329 },
    ],
  },
  SCHOENH_OG: {
    id: "venue:schoenh-og",
    floor: "eg",
    points: [
      { u: 0.4152, v: 0.5456 }, { u: 0.4011, v: 0.55 }, { u: 0.3902, v: 0.5574 }, { u: 0.3617, v: 0.5579 },
      { u: 0.3616, v: 0.5163 }, { u: 0.3729, v: 0.4821 }, { u: 0.3841, v: 0.4593 }, { u: 0.5875, v: 0.4654 },
      { u: 0.5821, v: 0.5068 }, { u: 0.5571, v: 0.4963 }, { u: 0.54, v: 0.4977 }, { u: 0.5214, v: 0.5096 },
      { u: 0.5038, v: 0.5361 }, { u: 0.4937, v: 0.5626 }, { u: 0.5058, v: 0.5313 }, { u: 0.4552, v: 0.523 },
      { u: 0.4203, v: 0.4903 }, { u: 0.3904, v: 0.4881 },
    ],
  },
  ZW: {
    id: "venue:zw",
    floor: "zwischen",
    points: [
      { u: 0.3894, v: 0.4852 }, { u: 0.4031, v: 0.4955 }, { u: 0.4478, v: 0.4976 }, { u: 0.4483, v: 0.4828 },
      { u: 0.4098, v: 0.4817 }, { u: 0.4178, v: 0.4558 }, { u: 0.5393, v: 0.4564 }, { u: 0.5405, v: 0.4694 },
      { u: 0.5169, v: 0.4829 }, { u: 0.5023, v: 0.503 }, { u: 0.4871, v: 0.5326 }, { u: 0.4772, v: 0.5648 },
      { u: 0.4742, v: 0.5882 }, { u: 0.4176, v: 0.5897 }, { u: 0.4097, v: 0.5618 }, { u: 0.4484, v: 0.5628 },
      { u: 0.4481, v: 0.5461 }, { u: 0.4112, v: 0.5456 }, { u: 0.4004, v: 0.5475 }, { u: 0.3883, v: 0.5574 },
      { u: 0.3842, v: 0.522 },
    ],
  },
  HZW: {
    id: "venue:hzw",
    floor: "zwischen",
    points: [
      { u: 0.4178, v: 0.4566 }, { u: 0.4662, v: 0.4575 }, { u: 0.4669, v: 0.5867 }, { u: 0.4176, v: 0.5879 },
      { u: 0.4094, v: 0.5623 }, { u: 0.4481, v: 0.5639 }, { u: 0.4483, v: 0.5463 }, { u: 0.4113, v: 0.5442 },
      { u: 0.4003, v: 0.5474 }, { u: 0.3888, v: 0.5576 }, { u: 0.3851, v: 0.5227 }, { u: 0.3884, v: 0.4859 },
      { u: 0.4028, v: 0.4964 }, { u: 0.4164, v: 0.4992 }, { u: 0.4479, v: 0.4985 }, { u: 0.4478, v: 0.4834 },
      { u: 0.4096, v: 0.4827 },
    ],
  },
  OG: {
    id: "venue:og",
    floor: "og",
    points: [
      { u: 0.123, v: 0.4225 }, { u: 0.1325, v: 0.4282 }, { u: 0.1289, v: 0.4568 }, { u: 0.2649, v: 0.4579 },
      { u: 0.2756, v: 0.3686 }, { u: 0.2955, v: 0.3777 }, { u: 0.2862, v: 0.4565 }, { u: 0.3238, v: 0.456 },
      { u: 0.3313, v: 0.3924 }, { u: 0.3398, v: 0.3954 }, { u: 0.3321, v: 0.4597 }, { u: 0.3539, v: 0.47 },
      { u: 0.3618, v: 0.4047 }, { u: 0.3698, v: 0.4083 }, { u: 0.364, v: 0.4564 }, { u: 0.4432, v: 0.457 },
      { u: 0.4439, v: 0.485 }, { u: 0.4106, v: 0.4859 }, { u: 0.411, v: 0.559 }, { u: 0.4442, v: 0.5593 },
      { u: 0.4441, v: 0.5864 }, { u: 0.3539, v: 0.5875 }, { u: 0.3535, v: 0.5784 }, { u: 0.3182, v: 0.5779 },
      { u: 0.3173, v: 0.5863 }, { u: 0.2279, v: 0.5866 }, { u: 0.2272, v: 0.5781 }, { u: 0.193, v: 0.5778 },
      { u: 0.1927, v: 0.5868 }, { u: 0.1131, v: 0.5861 }, { u: 0.1038, v: 0.5754 },
    ],
  },
  UP_WITHOUT_HALLE_KINO: {
    id: "venue:up-without-halle-kino",
    floor: "eg",
    points: [
      { u: 0.3519, v: 0.5587 }, { u: 0.3561, v: 0.5222 }, { u: 0.3715, v: 0.5018 }, { u: 0.388, v: 0.4901 },
      { u: 0.4163, v: 0.5442 }, { u: 0.3899, v: 0.5584 },
    ],
  },
} satisfies Record<string, MapArea>;

// The standing areas to show, for an event's answers:
// - Upper floor: any of its options on (Kino 6–10, WC Oben, Galerie Bar,
//   Galerie — which comes on with the others, see withConsequences) shows
//   its area, and the mezzanine's — ZW with the Zwischenebene on, HZW
//   without. With none of the ground floor's rooms (Kino 2–5) or Main Bar
//   on as well — Kino 1 may be — the ground floor shows the way up: by the
//   Schönhauser entrance (with S), or by the Gleimstraße.
// - The Zwischenebene on with nothing upstairs: ZW alone, up there.
// - And with the upper floor in use, Kino 4, Kino 5 or the Main Bar on,
//   the Gleimstraße entrance open and the Schönhauser one not, but none of
//   Kino 1–3 or WC Halle/Kino, the ground floor's "up without Halle/Kino"
//   too, beside the rest.
// - Otherwise the west (Kino 4, Kino 5, Main Bar, WC Halle/Hof) is HU, the
//   upper floor in use or not; with any of Kino 1–3 or the Schönhauser
//   entrance it's H — and S, with the Schönhauser entrance.
// - Without the west, Kino 2 or 3 by the Schönhauser entrance is HO and S;
//   by the Gleimstraße alone, HOG. Kino 1 on its own shows nothing.
// - HU and HO are the Wagenhalle shared ("Halle Geteilt", nicht exklusiv);
//   taken whole (exklusiv), either is H instead.
export function linkedAreas(answer: ((key: string) => true | string | null) | null): MapArea[] {
  if (!answer) return [];
  const on = (key: string) => answer(key) === true;
  const any = (keys: string[]) => keys.some(on);
  const west = any([saal(4), saal(5), MAINBAR, WC_HALLE_HOF]);
  const eastKinos = any([saal(1), saal(2), saal(3)]);
  const [gleim, schoenh] = ENTRANCES.map(on);
  const upstairs = any(UPSTAIRS);
  // The ground floor's rooms that take the event's area down there — not
  // Kino 1, which on its own shows none (and so leaves the way up).
  const groundRooms = any([saal(2), saal(3), saal(4), saal(5), MAINBAR]);
  // HU and HO share the hall (see hallSplitCase); taken whole, it's H.
  const split = hallSplit(answer);

  const shown: MapArea[] = [];
  if (upstairs) shown.push(AREAS.OG, on(ZWISCHENEBENE) ? AREAS.ZW : AREAS.HZW);
  else if (on(ZWISCHENEBENE)) shown.push(AREAS.ZW);
  if (upstairs && !groundRooms) {
    if (schoenh) shown.push(AREAS.SCHOENH_OG, AREAS.S);
    else if (gleim) shown.push(AREAS.GLEIM_OG);
  } else if (west && !eastKinos && !schoenh) {
    shown.push(split ? AREAS.HU : AREAS.H);
  } else if (west) {
    shown.push(AREAS.H);
    if (schoenh) shown.push(AREAS.S);
  } else if ((on(saal(2)) || on(saal(3))) && schoenh) {
    shown.push(split ? AREAS.HO : AREAS.H, AREAS.S);
  } else if ((on(saal(2)) || on(saal(3))) && gleim) {
    shown.push(AREAS.HOG);
  }
  if (
    upstairs &&
    gleim &&
    !schoenh &&
    any([saal(4), saal(5), MAINBAR]) &&
    !any([saal(1), saal(2), saal(3), WC_HALLE_KINO])
  ) {
    shown.push(AREAS.UP_WITHOUT_HALLE_KINO);
  }
  return shown;
}
