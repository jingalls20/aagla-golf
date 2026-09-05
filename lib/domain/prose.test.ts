import { describe, expect, it } from 'vitest';
import {
  Subject,
  atVenue,
  count,
  listWords,
  marginOver,
  ordinal,
  ordinalWord,
  paragraph,
  paragraphs,
  scoringLine,
  toParFigure,
  toParWords,
  word,
} from './prose';

describe('count', () => {
  it('spells small numbers and keeps large ones as figures', () => {
    expect(count(1, 'win')).toBe('one win');
    expect(count(5, 'win')).toBe('five wins');
    expect(count(12, 'event')).toBe('twelve events');
    expect(count(21, 'event')).toBe('21 events');
  });

  it('keeps halves as figures, which this league deals in constantly', () => {
    expect(count(3.5, 'point')).toBe('3.5 points');
    expect(count(0.5, 'point')).toBe('0.5 points');
  });

  it('takes an irregular plural', () => {
    expect(count(2, 'finish', 'finishes')).toBe('two finishes');
  });
});

describe('word and ordinals', () => {
  it('reads small numbers as words', () => {
    expect(word(0)).toBe('no');
    expect(word(7)).toBe('seven');
    expect(word(40)).toBe('40');
  });

  it('gives both ordinal forms', () => {
    expect(ordinalWord(3)).toBe('third');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    // The teens are the trap every ordinal helper falls into.
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(21)).toBe('21st');
  });
});

describe('listWords', () => {
  it('joins the way a sentence would', () => {
    expect(listWords([])).toBe('');
    expect(listWords(['Ann'])).toBe('Ann');
    expect(listWords(['Ann', 'Bob'])).toBe('Ann and Bob');
    expect(listWords(['Ann', 'Bob', 'Cal'])).toBe('Ann, Bob and Cal');
  });
});

describe('scores', () => {
  it('says scores the golfer way in words', () => {
    expect(toParWords(0)).toBe('level par');
    expect(toParWords(-4)).toBe('four under par');
    expect(toParWords(3)).toBe('three over par');
    // Without "par", for mid-sentence use: "never worse than three over".
    expect(toParWords(-2, false)).toBe('two under');
  });

  it('and in the compact leaderboard form', () => {
    expect(toParFigure(0)).toBe('E');
    expect(toParFigure(-5)).toBe('−5');
    expect(toParFigure(4)).toBe('+4');
  });

  it('prints a season as one scoring line, DNPs included', () => {
    expect(scoringLine([-1, -4, 4, null, -5])).toBe('−1, −4, +4, DNP, −5');
  });
});

describe('Subject', () => {
  it('gives the full name once, then the surname', () => {
    // The register golf writing uses, and the reason this app needs no
    // pronouns it has no way of knowing.
    const s = new Subject('Taylor Musselman');
    expect(s.name()).toBe('Taylor Musselman');
    expect(s.name()).toBe('Musselman');
    expect(s.name()).toBe('Musselman');
  });

  it('can re-anchor with the full name for a new paragraph', () => {
    const s = new Subject('Taylor Musselman');
    expect(s.name()).toBe('Taylor Musselman');
    expect(s.full()).toBe('Taylor Musselman');
    expect(s.name()).toBe('Musselman');
  });

  it('handles a possessive, including a name ending in s', () => {
    const s = new Subject('Josh Ramos');
    expect(s.possessive()).toBe("Josh Ramos'");
    // The surname ends in s, so the apostrophe stays bare once the passage
    // drops to it.
    expect(s.possessive()).toBe("Ramos'");
    expect(new Subject('Ann Green').possessive()).toBe("Ann Green's");
    expect(new Subject('Chris Downs').possessive()).toBe("Chris Downs'");
  });

  it('copes with a single-word name', () => {
    const s = new Subject('Zander');
    expect(s.name()).toBe('Zander');
    expect(s.name()).toBe('Zander');
  });
});

describe('marginOver', () => {
  it('states a margin when there is one', () => {
    expect(marginOver(6.5, 7.5)).toBe('one point');
    expect(marginOver(4, 9)).toBe('five points');
  });

  it('refuses to invent one from a tie or a missing chaser', () => {
    expect(marginOver(4, 4)).toBeNull();
    expect(marginOver(4, null)).toBeNull();
    // A chaser ahead of the leader is not a margin either.
    expect(marginOver(9, 4)).toBeNull();
  });
});

describe('atVenue', () => {
  it('names a real course', () => {
    expect(atVenue('Toad Valley')).toBe(' at Toad Valley');
  });

  it('drops the clause rather than printing a placeholder', () => {
    // Unnamed events fall back to `#97` for table headers. That is fine in a
    // column and looks broken in a sentence.
    expect(atVenue('#97')).toBe('');
    expect(atVenue('97')).toBe('');
    expect(atVenue(null)).toBe('');
    expect(atVenue('')).toBe('');
    expect(atVenue('   ')).toBe('');
  });
});

describe('assembly', () => {
  it('drops empty sentences rather than leaving double spaces', () => {
    expect(paragraph(['One.', null, '', 'Two.'])).toBe('One. Two.');
  });

  it('drops empty paragraphs', () => {
    expect(paragraphs(['One.', '', null, 'Two.'])).toEqual(['One.', 'Two.']);
  });
});
