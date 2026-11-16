// Where a word may be hyphenated, by German syllable rules (which do well
// enough by English names too): a single consonant between vowels starts
// the next syllable (BRO-DE-RICK), a run of them gives its last one to it
// (WIN-TER, NÄCHS-TE) unless the run ends in a pair that starts syllables
// (PRO-GRAMM, BUCH-PRE-MIE-RE), and sch, ch, ck, ph, th and sh, like ei, ie,
// au and the other vowel pairs, are never split. A few common prefixes
// (VER-, BE-, GE-…) come off whole. Not a dictionary — it can miss — so a
// break is taken only when it buys real size (see fitTitle).
//
// Returns the word in pieces, which join back to it exactly; a line may
// end after any piece but the last. A piece that ends in a hyphen of its
// own (MUSIK-PODCAST) needs no second one added.

const VOWELS = "aeiouyäöü";
const VOWEL_PAIRS = ["aa", "ee", "oo", "ie", "ei", "ai", "ay", "ey", "au", "eu", "äu", "ou", "oi"];
const CONSONANT_GROUPS = ["sch", "ch", "ck", "ph", "th", "sh", "qu"];
// Pairs that begin a syllable, kept together on the next line.
const ONSETS = new Set(
  ["b", "c", "d", "f", "g", "k", "p", "t", "ch", "sch", "ph", "th"]
    .flatMap((c) => ["l", "r"].map((l) => c + l))
    .filter((pair) => !["tl", "dl"].includes(pair))
    .concat(["kn", "pf", "schw", "schm", "schn"]),
);
const PREFIXES = ["miss", "ver", "zer", "ent", "be", "ge", "er", "vor", "aus", "ein", "mit", "un"];
// Fewest letters left on a line before a break, and carried to the next.
const MIN_BEFORE = 2;
const MIN_AFTER = 2;

export function hyphenationPieces(word: string): string[] {
  // A hyphen already in the word is a break of its own.
  return word.split(/(?<=-)(?=.)/).flatMap(syllables);
}

function syllables(part: string): string[] {
  // Only the letters are hyphenated: punctuation stays with the piece it
  // touches ("WIEDER!").
  const match = part.match(/^([^\p{L}]*)(\p{L}+)([^\p{L}]*)$/u);
  if (!match) return [part];
  const [, lead, letters, trail] = match;
  const cuts = breaks(letters.toLowerCase());
  if (cuts.length === 0) return [part];
  const pieces: string[] = [];
  let from = 0;
  for (const cut of cuts) {
    pieces.push(letters.slice(from, cut));
    from = cut;
  }
  pieces.push(letters.slice(from));
  pieces[0] = lead + pieces[0];
  pieces[pieces.length - 1] += trail;
  return pieces;
}

// Indexes in the word a line may break before.
function breaks(word: string, depth = 0): number[] {
  // A prefix, when what follows starts a syllable cleanly — and then the
  // rest on its own, which may have one more (MISS-VER-STE-HEN). "gn" only
  // starts one straight after the first (VER-GNÜ-GEN, but BE-GEG-NUN-GEN).
  for (const prefix of PREFIXES) {
    const rest = word.slice(prefix.length);
    if (word.startsWith(prefix) && rest.length >= 4 && startsSyllable(rest, depth === 0)) {
      return within(word, [prefix.length, ...breaks(rest, depth + 1).map((cut) => cut + prefix.length)]);
    }
  }

  const cuts = new Set<number>();
  const units = toUnits(word);
  let at = 0;
  let lastVowelEnd = -1;
  let consonants: { start: number; text: string }[] = [];
  for (const unit of units) {
    if (unit.vowel) {
      if (lastVowelEnd >= 0 && consonants.length > 0) {
        const keep = consonants.length >= 2 && ONSETS.has(consonants.slice(-2).map((c) => c.text).join("")) ? 2 : 1;
        cuts.add(consonants[Math.max(0, consonants.length - keep)].start);
      }
      lastVowelEnd = at + unit.text.length;
      consonants = [];
    } else {
      consonants.push({ start: at, text: unit.text });
    }
    at += unit.text.length;
  }

  return within(word, [...cuts]);
}

// Never a last "-GE", "-TE" alone: right in German (WO-CHE) but wrong in
// English (WINTER-AGE, not WINTERA-GE), and the two can't be told apart.
function within(word: string, cuts: number[]) {
  return cuts
    .filter((cut) => cut >= MIN_BEFORE && word.length - cut >= MIN_AFTER)
    .filter((cut) => !(word.length - cut === 2 && word.endsWith("e")))
    .sort((a, b) => a - b);
}

function startsSyllable(rest: string, allowGn: boolean) {
  const units = toUnits(rest);
  if (units[0]?.vowel) return false;
  if (units[1]?.vowel) return true;
  const pair = units[0].text + (units[1]?.text ?? "");
  return (ONSETS.has(pair) || pair === "st" || pair === "sp" || (allowGn && pair === "gn")) && !!units[2]?.vowel;
}

function toUnits(word: string): { text: string; vowel: boolean }[] {
  const units: { text: string; vowel: boolean }[] = [];
  for (let i = 0; i < word.length; ) {
    const group = CONSONANT_GROUPS.find((g) => word.startsWith(g, i));
    const pair = VOWEL_PAIRS.find((p) => word.startsWith(p, i));
    const text = group ?? pair ?? word[i];
    units.push({ text, vowel: !group && VOWELS.includes(text[0]) });
    i += text.length;
  }
  return units;
}
