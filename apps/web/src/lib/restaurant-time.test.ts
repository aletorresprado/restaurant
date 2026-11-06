import { describe, expect, it } from 'vitest';
import { restaurantInstant } from './restaurant-time';

describe('restaurant wall times', () => {
  it('converts the restaurant date and time to an explicit UTC instant', () => {
    expect(restaurantInstant('2026-11-20T23:30')).toBe('2026-11-21T02:30:00.000Z');
    expect(restaurantInstant('2026-11-21T01:30')).toBe('2026-11-21T04:30:00.000Z');
  });
  it('rejects impossible dates and malformed times', () => {
    expect(() => restaurantInstant('2026-02-30T12:00')).toThrow();
    expect(() => restaurantInstant('2026-11-20T24:00')).toThrow();
    expect(() => restaurantInstant('2026-11-20T12:00Z')).toThrow();
  });
  it('rejects a skipped wall hour instead of silently changing the chosen time', () => {
    expect(() => restaurantInstant('2026-03-08T02:30', 'America/New_York')).toThrow('no existe');
  });
});
