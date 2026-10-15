import { beforeEach, describe, expect, it } from 'vitest';
import { Calendar } from '@shared/domain/calendar.js';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { InMemoryBettingLedger } from '../infrastructure/in-memory/in-memory-betting-ledger.js';
import { InMemoryBookmakerIdentityQuery } from '../infrastructure/in-memory/in-memory-bookmaker-identity.query.js';
import { InMemoryEquivalenceReader } from '../infrastructure/in-memory/in-memory-equivalence-reader.js';
import { FixedRateYieldCalculator } from '../infrastructure/in-memory/in-memory-yield-calculator.js';
import type { LedgerBetEntry } from './ports/betting-ledger-reader.port.js';
import { SummariseBetting } from './summarise-betting.use-case.js';

const USER_ID = '0192f3c1-7a1b-7c3e-9f20-000000000001';
/** 21:47 on 13 October in São Paulo. */
const NOW = new Date('2026-10-14T00:47:00.000Z');
const ANNUAL_RATE_PERCENT = 11.4;

const ANDORINHA = 'bkm_0192f3c1-7a1b-7c3e-9f20-00000000000a';
const KEYWORD_HOUSE = 'bkm_unregistered_0d3c4f2a';

let ledger: InMemoryBettingLedger;
let identities: InMemoryBookmakerIdentityQuery;
let equivalences: InMemoryEquivalenceReader;
let summarise: SummariseBetting;

function aLedgerBet(
  overrides: Partial<LedgerBetEntry> & { readonly amountInCents: number },
): LedgerBetEntry {
  return {
    occurredAt: new Date('2026-10-10T02:52:00.000Z'),
    bookmakerId: ANDORINHA,
    matchedBy: 'GAMBLING_MCC',
    confidence: 'HIGH',
    ...overrides,
  };
}

beforeEach(() => {
  ledger = new InMemoryBettingLedger();
  identities = new InMemoryBookmakerIdentityQuery();
  equivalences = new InMemoryEquivalenceReader();
  identities.know(
    { bookmakerId: ANDORINHA, name: 'Aposta Andorinha', registryStatus: 'REGISTERED' },
    { bookmakerId: KEYWORD_HOUSE, name: 'Esportes da Sorte', registryStatus: 'UNREGISTERED' },
  );
  summarise = new SummariseBetting({
    ledger,
    identities,
    equivalences,
    yields: new FixedRateYieldCalculator(ANNUAL_RATE_PERCENT),
    calendar: new Calendar('America/Sao_Paulo'),
    clock: new FixedClock(NOW),
  });
});

async function summaryFor(days: 30 | 90 | 180 | 360 = 360) {
  const result = await summarise.execute({ userId: USER_ID, days });

  if (!result.ok) {
    throw new Error(`refused: ${result.error.code}`);
  }

  return result.value;
}

describe('SummariseBetting', () => {
  describe('with no consent', () => {
    beforeEach(() => {
      ledger.hold({ syncStatus: 'NO_CONSENT' });
    });

    it('is a successful state, not an error', async () => {
      expect((await summaryFor()).syncStatus).toBe('NO_CONSENT');
    });

    /**
     * A zero here would read as "you spent nothing on bets". The product has
     * never seen this person's statement, so it has nothing to say about it.
     */
    it('answers the same shape with no figures in it', async () => {
      const summary = await summaryFor();

      expect(summary.cost.total.amountInCents).toBe(0);
      expect(summary.cost.firstBetAt).toBeNull();
      expect(summary.incomeShare).toBeNull();
      expect(summary.bookmakers).toEqual([]);
      expect(summary.detectionTallies).toEqual([]);
      expect(summary.equivalences.ownSpending).toEqual([]);
      expect(summary.hourBuckets).toHaveLength(8);
    });
  });

  describe('with a connected account', () => {
    it('describes the window in São Paulo calendar keys', async () => {
      const summary = await summaryFor(30);

      expect(summary.window).toEqual({
        days: 30,
        fromDayKey: '2026-09-14',
        toDayKey: '2026-10-13',
      });
    });

    it('nets refunds out of the cost and reports them separately', async () => {
      ledger.hold({
        entries: [
          aLedgerBet({ amountInCents: -10_000 }),
          aLedgerBet({ amountInCents: -10_000 }),
          aLedgerBet({ amountInCents: 5_000 }),
        ],
      });

      const summary = await summaryFor();

      expect(summary.cost.total.amountInCents).toBe(15_000);
      expect(summary.cost.transactionCount).toBe(2);
      expect(summary.cost.refunds).toEqual({
        total: { amountInCents: 5_000, currency: 'BRL' },
        count: 1,
      });
    });

    it('reframes the net total at the rate awareness holds', async () => {
      ledger.hold({ entries: [aLedgerBet({ amountInCents: -100_000 })] });

      const summary = await summaryFor();

      expect(summary.yield).toEqual({
        betYieldEquivalent: { amountInCents: 111_400, currency: 'BRL' },
        annualRatePercent: ANNUAL_RATE_PERCENT,
      });
    });

    it('names each house from the table this context owns', async () => {
      ledger.hold({
        entries: [
          aLedgerBet({ amountInCents: -30_000 }),
          aLedgerBet({
            amountInCents: -1_000,
            bookmakerId: KEYWORD_HOUSE,
            matchedBy: 'DESCRIPTION_KEYWORD',
            confidence: 'LOW',
          }),
        ],
      });

      const summary = await summaryFor();

      expect(summary.bookmakers.map((house) => [house.name, house.registryStatus])).toEqual([
        ['Aposta Andorinha', 'REGISTERED'],
        ['Esportes da Sorte', 'UNREGISTERED'],
      ]);
    });

    it('counts a row it cannot attribute rather than dropping its amount', async () => {
      ledger.hold({ entries: [aLedgerBet({ amountInCents: -8_000, bookmakerId: null })] });

      const summary = await summaryFor();

      expect(summary.cost.total.amountInCents).toBe(8_000);
      expect(summary.bookmakers).toHaveLength(1);
    });

    it('states the share of income as an integer', async () => {
      ledger.hold({
        entries: [aLedgerBet({ amountInCents: -85_300 })],
        incomeInCents: 385_100,
      });

      expect((await summaryFor()).incomeShare).toEqual({
        income: { amountInCents: 385_100, currency: 'BRL' },
        percentage: 22,
      });
    });

    /** Above 100 is a fact about the window, not something to soften or cap. */
    it('does not cap the share at 100', async () => {
      ledger.hold({
        entries: [aLedgerBet({ amountInCents: -200_000 })],
        incomeInCents: 100_000,
      });

      expect((await summaryFor()).incomeShare?.percentage).toBe(200);
    });

    it('hides the share when there was no income in the window', async () => {
      ledger.hold({ entries: [aLedgerBet({ amountInCents: -5_000 })], incomeInCents: 0 });

      expect((await summaryFor()).incomeShare).toBeNull();
    });

    it('divides the equivalences out of the real net total', async () => {
      ledger.hold({
        entries: [aLedgerBet({ amountInCents: -90_000 }), aLedgerBet({ amountInCents: 15_000 })],
      });

      await summaryFor();

      expect(equivalences.lastTotalInCents).toBe(75_000);
    });

    it('passes the catalogue through with its prices and review date', async () => {
      ledger.hold({ entries: [aLedgerBet({ amountInCents: -500_000 })] });
      equivalences.stock({
        ownSpending: [
          {
            category: 'GROCERIES',
            months: 17,
            monthlyAverageInCents: 47_895,
            completeMonthsCounted: 11,
          },
        ],
        referenceItems: [
          {
            id: 'notebook',
            singular: 'notebook',
            plural: 'notebooks',
            quantity: 2,
            unitPriceInCents: 250_000,
            targetInCents: 500_000,
            reviewedAt: '2026-10-01',
          },
        ],
      });

      const summary = await summaryFor();

      expect(summary.equivalences.ownSpending[0]).toEqual({
        category: 'GROCERIES',
        months: 17,
        monthlyAverage: { amountInCents: 47_895, currency: 'BRL' },
        completeMonthsCounted: 11,
      });
      expect(summary.equivalences.referenceItems[0]).toEqual({
        id: 'notebook',
        singular: 'notebook',
        plural: 'notebooks',
        quantity: 2,
        unitPrice: { amountInCents: 250_000, currency: 'BRL' },
        target: { amountInCents: 500_000, currency: 'BRL' },
        reviewedAt: '2026-10-01',
      });
    });

    it('leaves a bet older than the window out of every figure', async () => {
      ledger.hold({
        entries: [
          aLedgerBet({ amountInCents: -10_000, occurredAt: new Date('2026-10-12T15:00:00.000Z') }),
          aLedgerBet({ amountInCents: -99_000, occurredAt: new Date('2025-01-01T15:00:00.000Z') }),
        ],
      });

      const summary = await summaryFor(30);

      expect(summary.cost.total.amountInCents).toBe(10_000);
      expect(summary.cost.transactionCount).toBe(1);
    });

    it('shows the figures it has while the first synchronisation runs', async () => {
      ledger.hold({ syncStatus: 'SYNCING', entries: [aLedgerBet({ amountInCents: -4_000 })] });

      const summary = await summaryFor();

      expect(summary.syncStatus).toBe('SYNCING');
      expect(summary.cost.total.amountInCents).toBe(4_000);
    });

    it('answers zeros and empty lists for a reader with no bets', async () => {
      ledger.hold({ entries: [] });

      const summary = await summaryFor();

      expect(summary.cost.total.amountInCents).toBe(0);
      expect(summary.cost.firstBetAt).toBeNull();
      expect(summary.bookmakers).toEqual([]);
      expect(summary.detectionTallies).toEqual([]);
      expect(summary.hourBuckets.every((bucket) => bucket.count === 0)).toBe(true);
    });
  });
});
