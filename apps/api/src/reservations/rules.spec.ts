import { describe, expect, it } from '@jest/globals';
import { aligned, canCustomerCancel, fits, overlaps } from './rules';
describe('reservation boundaries', () => {
  const at = (hour: number) => new Date(Date.UTC(2026, 10, 2, hour));
  it('permits exact closing and touching reservations but rejects overlaps', () => {
    expect(fits(at(20), at(22), { startAt: at(18), endAt: at(22) })).toBe(true);
    expect(fits(at(21), at(23), { startAt: at(18), endAt: at(22) })).toBe(false);
    expect(overlaps({ startAt: at(18), endAt: at(20) }, { startAt: at(20), endAt: at(22) })).toBe(false);
    expect(overlaps({ startAt: at(18), endAt: at(21) }, { startAt: at(20), endAt: at(22) })).toBe(true);
  });
  it('requires the service grid and at least exactly six hours to cancel', () => {
    expect(aligned(at(20), at(18), 30)).toBe(true);
    expect(aligned(new Date(at(20).getTime() + 1), at(18), 30)).toBe(false);
    expect(canCustomerCancel(at(20), at(14))).toBe(true);
    expect(canCustomerCancel(at(20), new Date(at(14).getTime() + 1))).toBe(false);
  });
});
