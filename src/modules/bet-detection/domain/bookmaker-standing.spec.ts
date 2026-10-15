import { describe, expect, it } from 'vitest';
import { aBetEntry } from '../testing/bet-entry-builder.js';
import { BookmakerStanding } from './bookmaker-standing.js';

const ANDORINHA = { bookmakerId: 'bkm_andorinha', name: 'Aposta Andorinha' };
const VELA = { bookmakerId: 'bkm_vela', name: 'Vela Bets' };
const GAIVOTA = { bookmakerId: 'bkm_gaivota', name: 'Gaivota Sports' };

describe('BookmakerStanding', () => {
  it('ranks by net total, then by name, so a tie does not shuffle', () => {
    const standings = BookmakerStanding.rank([
      aBetEntry().of(-5_000).from(VELA).build(),
      aBetEntry().of(-40_000).from(ANDORINHA).build(),
      aBetEntry().of(-5_000).from(GAIVOTA).build(),
    ]);

    expect(standings.map((standing) => standing.bookmaker.name)).toEqual([
      'Aposta Andorinha',
      'Gaivota Sports',
      'Vela Bets',
    ]);
  });

  it('still lists a fully refunded house, at zero', () => {
    const standings = BookmakerStanding.rank([
      aBetEntry().of(-7_500).from(VELA).build(),
      aBetEntry().of(7_500).from(VELA).build(),
    ]);

    expect(standings).toHaveLength(1);
    expect(standings[0]?.total.amountInCents).toBe(0);
    expect(standings[0]?.transactionCount).toBe(1);
  });

  it('reports the weakest confidence with the reason that earned it', () => {
    const nine = Array.from({ length: 9 }, () =>
      aBetEntry().of(-1_000).from(ANDORINHA).matchedByPolicy('GAMBLING_MCC', 'HIGH').build(),
    );
    const standings = BookmakerStanding.rank([
      ...nine,
      aBetEntry().of(-1_000).from(ANDORINHA).matchedByPolicy('DESCRIPTION_KEYWORD', 'LOW').build(),
    ]);

    expect(standings[0]?.weakest).toEqual({
      matchedBy: 'DESCRIPTION_KEYWORD',
      confidence: 'LOW',
    });
    expect(standings[0]?.detections).toEqual([
      { matchedBy: 'GAMBLING_MCC', count: 9, lowestConfidence: 'HIGH' },
      { matchedBy: 'DESCRIPTION_KEYWORD', count: 1, lowestConfidence: 'LOW' },
    ]);
  });

  it('breaks an equal confidence toward the weaker policy', () => {
    const standings = BookmakerStanding.rank([
      aBetEntry().of(-1_000).from(ANDORINHA).matchedByPolicy('GAMBLING_MCC', 'LOW').build(),
      aBetEntry().of(-1_000).from(ANDORINHA).matchedByPolicy('DESCRIPTION_KEYWORD', 'LOW').build(),
    ]);

    expect(standings[0]?.weakest.matchedBy).toBe('DESCRIPTION_KEYWORD');
  });

  it('never pairs one policy with another policy confidence', () => {
    const standings = BookmakerStanding.rank([
      aBetEntry().of(-1_000).from(ANDORINHA).matchedByPolicy('GAMBLING_MCC', 'HIGH').build(),
      aBetEntry().of(-1_000).from(ANDORINHA).matchedByPolicy('LICENSED_CNPJ', 'MEDIUM').build(),
    ]);

    expect(standings[0]?.weakest).toEqual({ matchedBy: 'LICENSED_CNPJ', confidence: 'MEDIUM' });
  });

  it('counts bets placed only, so the breakdown adds up to the row', () => {
    const standings = BookmakerStanding.rank([
      aBetEntry().of(-1_000).from(ANDORINHA).matchedByPolicy('GAMBLING_MCC', 'HIGH').build(),
      aBetEntry().of(400).from(ANDORINHA).matchedByPolicy('GAMBLING_MCC', 'HIGH').build(),
    ]);

    const standing = standings[0];
    const counted = standing?.detections.reduce((sum, one) => sum + one.count, 0);

    expect(counted).toBe(standing?.transactionCount);
  });

  it('spans from the first movement to the last, refunds included', () => {
    const standings = BookmakerStanding.rank([
      aBetEntry().of(-1_000).from(VELA).at(new Date('2026-03-01T10:00:00.000Z')).build(),
      aBetEntry().of(400).from(VELA).at(new Date('2026-09-09T10:00:00.000Z')).build(),
    ]);

    expect(standings[0]?.firstSeenAt.toISOString()).toBe('2026-03-01T10:00:00.000Z');
    expect(standings[0]?.lastSeenAt.toISOString()).toBe('2026-09-09T10:00:00.000Z');
  });

  it('is empty when there is nothing to rank', () => {
    expect(BookmakerStanding.rank([])).toEqual([]);
  });
});
