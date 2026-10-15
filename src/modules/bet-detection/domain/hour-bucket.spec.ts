import { describe, expect, it } from 'vitest';
import { HourBucket } from './hour-bucket.js';

describe('HourBucket', () => {
  it('always answers eight bands from 0 to 21, zeros included', () => {
    const buckets = HourBucket.distribute([]);

    expect(buckets.map((bucket) => bucket.startHour)).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
    expect(buckets.every((bucket) => bucket.count === 0)).toBe(true);
  });

  it('puts a late-evening bet in the 21h band', () => {
    const buckets = HourBucket.distribute([23]);

    expect(buckets[7]?.count).toBe(1);
  });

  it('puts a bet just after midnight in the 0h band', () => {
    const buckets = HourBucket.distribute([0]);

    expect(buckets[0]?.count).toBe(1);
  });

  it('counts a band boundary in the band it opens', () => {
    const buckets = HourBucket.distribute([3, 5, 6]);

    expect(buckets[1]?.count).toBe(2);
    expect(buckets[2]?.count).toBe(1);
  });

  it('keeps eight bands whatever the hour claims to be', () => {
    expect(HourBucket.distribute([24, -1])).toHaveLength(8);
  });
});
