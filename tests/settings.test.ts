import { describe, it, expect } from 'vitest';
import { State } from '../src/daemon/state.js';
import { DEFAULT_SETTINGS } from '../src/shared/types.js';

describe('Settings', () => {
  it('returns defaults on a fresh DB', () => {
    const s = new State(':memory:');
    expect(s.getAllSettings()).toEqual(DEFAULT_SETTINGS);
    s.close();
  });

  it('reads a single setting', () => {
    const s = new State(':memory:');
    expect(s.getSetting('theme.active')).toBe('aol');
    expect(s.getSetting('audio.enabled')).toBe(true);
    expect(s.getSetting('theme.externalDir')).toBeNull();
    s.close();
  });

  it('round-trips a patch via setSettings', () => {
    const s = new State(':memory:');
    const next = s.setSettings({
      'theme.active': 'discord',
      'audio.enabled': false,
    });
    expect(next['theme.active']).toBe('discord');
    expect(next['audio.enabled']).toBe(false);
    expect(next['theme.externalDir']).toBeNull(); // unchanged
    expect(next['debug.devlog']).toBe(false); // default

    expect(s.getSetting('theme.active')).toBe('discord');
    s.close();
  });

  it('sets externalDir to a string and back to null', () => {
    const s = new State(':memory:');
    s.setSettings({ 'theme.externalDir': '/tmp/themes' });
    expect(s.getSetting('theme.externalDir')).toBe('/tmp/themes');
    s.setSettings({ 'theme.externalDir': null });
    expect(s.getSetting('theme.externalDir')).toBeNull();
    s.close();
  });
});
