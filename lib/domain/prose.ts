/**
 * The house style, as code.
 *
 * Every summary in this app is generated rather than written, and the thing
 * that makes generated prose read like a machine is not bad grammar -- it is
 * sameness. The same sentence shape every time, the same name repeated in
 * every clause, a placeholder id printed where a course name should be, a
 * margin claimed where there is a tie. This module holds the primitives that
 * stop those, so five different generators make the same choices.
 *
 * The rules, stated once so they can be pointed at:
 *
 * 1. Lead with a person and what they did. Never with metadata.
 * 2. Full name on first mention; a pronoun or first name after it.
 * 3. Small counts as words, scores as figures against par.
 * 4. Commentary only where the arithmetic forces it. "Only time all year
 *    outside the top three" is countable. "He was unlucky" is not.
 * 5. No internal jargon, and never an internal placeholder -- an event with
 *    no name loses its clause rather than printing `#97`.
 * 6. State a margin only when there is one. A tie is a tie.
 * 7. When there is less to say, drop whole sentences. Do not hedge the ones
 *    that remain.
 */

/** Small numbers read better as words; larger ones as figures. */
const WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

const ORDINALS = [
  '',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
];

/**
 * A count, as the sentence wants to read it.
 *
 * Halves stay as figures -- "three and a half points" is correct but long,
 * and this league deals in halves constantly, so "3.5 points" wins on
 * scannability where the prose is already dense.
 */
export function count(n: number, one: string, many = `${one}s`): string {
  const unit = n === 1 ? one : many;
  if (!Number.isInteger(n)) return `${n} ${unit}`;
  return `${n >= 0 && n < WORDS.length ? WORDS[n] : n} ${unit}`;
}

/** Bare number as a word where small. */
export function word(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}

export function ordinalWord(n: number): string {
  return ORDINALS[n] ?? `${n}th`;
}

/** "1st", "2nd" -- for places, where the figure is what people scan for. */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

export function listWords(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Scores read the golfer's way: level par, two under par, three over par.
 *
 * Spelled out, because these land mid-sentence where a bare figure reads as
 * a stumble -- "the 5 under par at Toad Valley" against "the five under at
 * Toad Valley". The compact form below is for scoring lines, where figures
 * are exactly what the eye wants.
 */
export function toParWords(value: number, includePar = true): string {
  const v = Math.round(value * 10) / 10;
  if (v === 0) return includePar ? 'level par' : 'level';
  const tail = includePar ? ' par' : '';
  return v > 0 ? `${word(v)} over${tail}` : `${word(Math.abs(v))} under${tail}`;
}

/** The compact form, for a scoring line: −1, +4, E. */
export function toParFigure(value: number): string {
  const v = Math.round(value * 10) / 10;
  if (v === 0) return 'E';
  // A true minus sign rather than a hyphen: these sit in a row and the
  // hyphen is too short to read as a sign at small sizes.
  return v > 0 ? `+${v}` : `−${Math.abs(v)}`;
}

/** A whole season's rounds as one line, the way a leaderboard prints them. */
export function scoringLine(values: (number | null)[]): string {
  return values.map((v) => (v === null ? 'DNP' : toParFigure(v))).join(', ');
}

/**
 * How a person is named through a passage.
 *
 * Full name on first mention, surname after -- the register every golf
 * writer uses, and the reason this app does not need pronouns it has no way
 * of knowing. "Musselman was relentless" carries the same weight as
 * "Scheffler played consistently"; "Taylor was relentless" sounds like a
 * school report, and repeating the full name every time is what made the
 * first version of these summaries read like a machine.
 *
 * A single-word name is its own surname, so Zander stays Zander.
 *
 * Even so, the surname is not a licence to repeat it. Generators are
 * expected to merge clauses so the referent is needed once or twice per
 * paragraph, not once per sentence.
 */
export class Subject {
  private mentioned = false;

  constructor(readonly fullName: string) {}

  /** Full name the first time, surname after. */
  name(): string {
    if (!this.mentioned) {
      this.mentioned = true;
      return this.fullName;
    }
    return this.last();
  }

  /** Always the full name, for a passage that needs to re-anchor. */
  full(): string {
    this.mentioned = true;
    return this.fullName;
  }

  /** Always the surname, whether or not the full name has been used. */
  last(): string {
    const parts = this.fullName.trim().split(/\s+/);
    return parts[parts.length - 1] || this.fullName;
  }

  first(): string {
    return this.fullName.trim().split(/\s+/)[0] || this.fullName;
  }

  /** Possessive, respecting names that already end in s. */
  possessive(): string {
    const n = this.name();
    return n.endsWith('s') ? `${n}'` : `${n}'s`;
  }
}

/** "once", "twice", then "three times" -- English stops counting at two. */
export function times(n: number): string {
  if (n === 1) return 'once';
  if (n === 2) return 'twice';
  return `${word(n)} times`;
}

/**
 * A margin, only when there is one.
 *
 * Returns null for a tie or a missing chaser, so the caller drops the clause
 * rather than printing "0 points clear". Lower is better everywhere in this
 * league, so the margin is the chaser's figure minus the leader's.
 */
export function marginOver(
  leader: number,
  chaser: number | null,
  unit = 'point',
): string | null {
  if (chaser === null) return null;
  const margin = Math.round((chaser - leader) * 100) / 100;
  if (margin <= 0) return null;
  return count(margin, unit);
}

/**
 * A venue clause, or nothing at all.
 *
 * An event with no name falls back to `#97` for table headers, which is fine
 * in a column and looks broken in a sentence. Anything that still looks like
 * a placeholder is refused here so no generator has to remember.
 */
export function atVenue(label: string | null | undefined): string {
  const name = label?.trim();
  if (!name) return '';
  if (/^#?\d+$/.test(name)) return '';
  return ` at ${name}`;
}

/** Join sentences into a paragraph, dropping the ones that came back empty. */
export function paragraph(sentences: (string | null | undefined)[]): string {
  return sentences.filter((s): s is string => Boolean(s && s.trim())).join(' ');
}

/** Join paragraphs, dropping empties. Generators return these as an array so
 *  a caller can render real paragraph breaks rather than one wall of text. */
export function paragraphs(items: (string | null | undefined)[]): string[] {
  return items.filter((p): p is string => Boolean(p && p.trim()));
}
