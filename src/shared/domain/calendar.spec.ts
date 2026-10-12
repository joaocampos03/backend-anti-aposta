import { describe, expect, it } from 'vitest';
import { Calendar } from './calendar.js';

const SAO_PAULO = new Calendar('America/Sao_Paulo');

describe('Calendar', () => {
  describe('day keys', () => {
    it('keeps a late-night instant on the day it was lived', () => {
      // 23:30 in São Paulo is already the next day in UTC. Bucketing in UTC
      // would move this bet to the following day and cost a streak day.
      expect(SAO_PAULO.dayKeyOf(new Date('2026-10-11T02:30:00.000Z'))).toBe('2026-10-10');
    });

    it('rolls over at local midnight, not at UTC midnight', () => {
      expect(SAO_PAULO.dayKeyOf(new Date('2026-10-11T02:59:59.000Z'))).toBe('2026-10-10');
      expect(SAO_PAULO.dayKeyOf(new Date('2026-10-11T03:00:00.000Z'))).toBe('2026-10-11');
    });

    it('answers the local day for a midday instant', () => {
      expect(SAO_PAULO.dayKeyOf(new Date('2026-08-07T15:00:00.000Z'))).toBe('2026-08-07');
    });
  });

  describe('month keys', () => {
    it('keeps the first of the month at 00:30 local in that month', () => {
      expect(SAO_PAULO.monthKeyOf(new Date('2026-10-01T03:30:00.000Z'))).toBe('2026-10');
    });

    it('keeps the last of the month at 23:30 local in that month', () => {
      // 02:30 UTC on the 1st is 23:30 on the 30th in São Paulo.
      expect(SAO_PAULO.monthKeyOf(new Date('2026-10-01T02:30:00.000Z'))).toBe('2026-09');
    });

    it('walks backwards across a year boundary', () => {
      expect(SAO_PAULO.monthKeyBefore('2026-01')).toBe('2025-12');
    });

    it('walks forwards across a year boundary', () => {
      expect(SAO_PAULO.monthKeyAfter('2025-12')).toBe('2026-01');
    });

    it('lists the recent months newest first', () => {
      const keys = SAO_PAULO.recentMonthKeys(new Date('2026-10-11T15:00:00.000Z'), 4);

      expect(keys).toEqual(['2026-10', '2026-09', '2026-08', '2026-07']);
    });

    it('counts whole calendar months between two instants', () => {
      const earlier = new Date('2026-07-31T15:00:00.000Z');
      const later = new Date('2026-10-01T15:00:00.000Z');

      expect(SAO_PAULO.monthsBetween(earlier, later)).toBe(3);
    });
  });

  describe('boundaries', () => {
    it('starts a local day at 03:00 UTC, the São Paulo offset', () => {
      expect(SAO_PAULO.startOfDay('2026-10-10').toISOString()).toBe('2026-10-10T03:00:00.000Z');
    });

    it('starts a local month at its first local midnight', () => {
      expect(SAO_PAULO.startOfMonth('2026-10').toISOString()).toBe('2026-10-01T03:00:00.000Z');
    });

    it('ends a local month at the start of the next one', () => {
      expect(SAO_PAULO.startOfMonthAfter('2026-12').toISOString()).toBe(
        '2027-01-01T03:00:00.000Z',
      );
    });

    it('counts the window back in local days, so "30 days" is 30 lived days', () => {
      // The default period is `daysAgo < 30`: today plus the 29 days before it.
      const reference = new Date('2026-10-11T15:00:00.000Z');

      expect(SAO_PAULO.startOfDaysBefore(reference, 29).toISOString()).toBe(
        '2026-09-12T03:00:00.000Z',
      );
    });

    it('is stable when the reference is itself near local midnight', () => {
      const justBeforeMidnight = new Date('2026-10-11T02:59:00.000Z');

      expect(SAO_PAULO.startOfDaysBefore(justBeforeMidnight, 0).toISOString()).toBe(
        '2026-10-10T03:00:00.000Z',
      );
    });
  });

  describe('other timezones', () => {
    it('is not hardcoded to São Paulo', () => {
      const lisbon = new Calendar('Europe/Lisbon');

      expect(lisbon.dayKeyOf(new Date('2026-10-11T02:30:00.000Z'))).toBe('2026-10-11');
    });
  });
});
