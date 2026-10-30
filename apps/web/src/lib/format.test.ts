import { describe, expect, it } from 'vitest';
import { cancelDeadline, hhmm, restaurantDate } from './format';
describe('dates displayed in restaurant time', () => {
  it('shows UTC instants in the restaurant zone and respects the service midnight', () => {
    expect(hhmm('2026-11-03T03:30:00Z')).toBe('00:30');
    expect(restaurantDate(new Date('2026-11-03T02:00:00Z'))).toBe('2026-11-02');
    expect(restaurantDate(new Date('2026-11-03T03:30:00Z'))).toBe('2026-11-03');
  });
  it('calculates the cancellation deadline from the persisted instant', () => {
    expect(cancelDeadline('2026-11-03T03:30:00Z').toISOString()).toBe('2026-11-02T21:30:00.000Z');
  });
});
