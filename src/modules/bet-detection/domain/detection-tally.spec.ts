import { describe, expect, it } from 'vitest';
import { aBetEntry } from '../testing/bet-entry-builder.js';
import { DetectionTally } from './detection-tally.js';

describe('DetectionTally', () => {
  it('counts the bets each policy caught, with its share', () => {
    const tallies = DetectionTally.of([
      aBetEntry().of(-1_000).matchedByPolicy('GAMBLING_MCC', 'HIGH').build(),
      aBetEntry().of(-1_000).matchedByPolicy('GAMBLING_MCC', 'HIGH').build(),
      aBetEntry().of(-1_000).matchedByPolicy('GAMBLING_MCC', 'HIGH').build(),
      aBetEntry().of(-1_000).matchedByPolicy('DESCRIPTION_KEYWORD', 'LOW').build(),
    ]);

    expect(tallies.map((tally) => [tally.matchedBy, tally.count, tally.sharePercent])).toEqual([
      ['GAMBLING_MCC', 3, 75],
      ['DESCRIPTION_KEYWORD', 1, 25],
    ]);
  });

  it('leaves a policy that caught nothing out rather than listing it at zero', () => {
    const tallies = DetectionTally.of([
      aBetEntry().of(-1_000).matchedByPolicy('LICENSED_CNPJ', 'HIGH').build(),
    ]);

    expect(tallies).toHaveLength(1);
  });

  it('does not let a refund add a policy match', () => {
    const tallies = DetectionTally.of([
      aBetEntry().of(-1_000).matchedByPolicy('GAMBLING_MCC', 'HIGH').build(),
      aBetEntry().of(1_000).matchedByPolicy('GAMBLING_MCC', 'HIGH').build(),
    ]);

    expect(tallies[0]?.count).toBe(1);
    expect(tallies[0]?.sharePercent).toBe(100);
  });

  it('breaks an equal count by policy strength, so two loads cannot reshuffle', () => {
    const tallies = DetectionTally.of([
      aBetEntry().of(-1_000).matchedByPolicy('DESCRIPTION_KEYWORD', 'LOW').build(),
      aBetEntry().of(-1_000).matchedByPolicy('LICENSED_CNPJ', 'HIGH').build(),
      aBetEntry().of(-1_000).matchedByPolicy('GAMBLING_MCC', 'HIGH').build(),
    ]);

    expect(tallies.map((tally) => tally.matchedBy)).toEqual([
      'GAMBLING_MCC',
      'LICENSED_CNPJ',
      'DESCRIPTION_KEYWORD',
    ]);
  });

  it('is empty for a window with no bets placed', () => {
    expect(DetectionTally.of([])).toEqual([]);
  });

  /**
   * Three equal thirds round to 33 each. The screen states them as computed:
   * adjusting one to make the column reach 100 would misreport that one.
   */
  it('rounds each share independently, even when they do not sum to 100', () => {
    const tallies = DetectionTally.of([
      aBetEntry().of(-1_000).matchedByPolicy('GAMBLING_MCC', 'HIGH').build(),
      aBetEntry().of(-1_000).matchedByPolicy('LICENSED_CNPJ', 'HIGH').build(),
      aBetEntry().of(-1_000).matchedByPolicy('DESCRIPTION_KEYWORD', 'LOW').build(),
    ]);

    expect(tallies.map((tally) => tally.sharePercent)).toEqual([33, 33, 33]);
  });
});
