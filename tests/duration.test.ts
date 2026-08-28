import { describe, expect, it } from 'vitest';
import { durationToMs } from '../src/common/utils/duration.js';

describe('durationToMs', () => {
  it('converts supported duration strings', () => {
    expect(durationToMs('15m')).toBe(900_000);
    expect(durationToMs('7d')).toBe(604_800_000);
  });

  it('rejects invalid values', () => {
    expect(() => durationToMs('tomorrow')).toThrow('Invalid duration');
  });
});
