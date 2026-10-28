import { describe, expect, it } from '@jest/globals';
import { isoDay, nextDate, weeklyOverlap, windowFor } from './time';
describe('restaurant service dates', () => {
  it('resolves a night service in restaurant time, including year changes', () => {
    const result = windowFor('2026-12-31', { openingTime: '22:00', closingTime: '02:00' });
    expect(result.startAt.toISOString()).toBe('2027-01-01T01:00:00.000Z');
    expect(result.endAt.toISOString()).toBe('2027-01-01T05:00:00.000Z');
    expect(isoDay('2026-11-02')).toBe(1);
    expect(nextDate('2028-02-28')).toBe('2028-02-29');
  });
  it('rejects overlapping Sunday/Monday shifts while allowing touching endpoints', () => {
    const sunday = { dayOfWeek: 7, openingTime: '22:00', closingTime: '02:00', isActive: true };
    expect(weeklyOverlap([sunday, { dayOfWeek: 1, openingTime: '01:00', closingTime: '03:00', isActive: true }])).toBe(true);
    expect(weeklyOverlap([sunday, { dayOfWeek: 1, openingTime: '02:00', closingTime: '03:00', isActive: true }])).toBe(false);
    expect(weeklyOverlap([sunday, { dayOfWeek: 1, openingTime: '01:00', closingTime: '03:00', isActive: false }])).toBe(false);
  });
});
