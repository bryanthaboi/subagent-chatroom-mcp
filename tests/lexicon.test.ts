import { describe, it, expect } from 'vitest';
import {
  pickName,
  pickAwayMessage,
  pickFollowUpPhrase,
  suggestScreenNames,
  ADJECTIVES,
  NOUNS,
  AWAY_MESSAGES,
  FOLLOW_UPS,
} from '../src/daemon/lexicon.js';

describe('lexicon', () => {
  it('pools are non-empty', () => {
    expect(ADJECTIVES.length).toBeGreaterThan(20);
    expect(NOUNS.length).toBeGreaterThan(20);
    expect(AWAY_MESSAGES.length).toBeGreaterThan(20);
    expect(FOLLOW_UPS.length).toBeGreaterThan(4);
  });

  it('pickName returns a non-empty whitespace-free string under 24 chars', () => {
    for (let i = 0; i < 50; i++) {
      const n = pickName(new Set());
      expect(n.length).toBeGreaterThan(0);
      expect(n.length).toBeLessThan(24);
      expect(n).not.toMatch(/\s/);
    }
  });

  it('pickName avoids names already taken', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const n = pickName(taken);
      expect(taken.has(n)).toBe(false);
      taken.add(n);
    }
  });

  it('pickAwayMessage returns a string under 60 chars', () => {
    for (let i = 0; i < 20; i++) {
      const m = pickAwayMessage();
      expect(m.length).toBeGreaterThan(0);
      expect(m.length).toBeLessThan(60);
    }
  });

  it('pickFollowUpPhrase returns a string under 30 chars', () => {
    for (let i = 0; i < 10; i++) {
      const m = pickFollowUpPhrase();
      expect(m.length).toBeGreaterThan(0);
      expect(m.length).toBeLessThan(30);
    }
  });

  it('suggestScreenNames returns N distinct picks', () => {
    const names = suggestScreenNames(8, new Set());
    expect(names.length).toBe(8);
    expect(new Set(names).size).toBe(8);
  });
});
