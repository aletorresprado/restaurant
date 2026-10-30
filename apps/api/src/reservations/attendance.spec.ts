import { describe, expect, it } from '@jest/globals';
import { BUSINESS_CONFIG } from '@repo/config';
import { canRecordAttendance } from './rules';

describe('attendance time boundaries', () => {
  const start = new Date('2026-11-01T20:00:00Z');
  it('allows attendance from the exact start and rejects early check-in', () => {
    expect(canRecordAttendance(start, new Date(start.getTime() - 1), 'ATTENDED')).toBe(false);
    expect(canRecordAttendance(start, start, 'ATTENDED')).toBe(true);
  });
  it('requires the full configured tolerance before a no-show', () => {
    const threshold = start.getTime() + BUSINESS_CONFIG.attendance.noShowGracePeriodMinutes * 60000;
    expect(canRecordAttendance(start, new Date(threshold - 1), 'NO_SHOW')).toBe(false);
    expect(canRecordAttendance(start, new Date(threshold), 'NO_SHOW')).toBe(true);
  });
});
