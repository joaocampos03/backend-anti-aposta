import { beforeEach, describe, expect, it } from 'vitest';
import { Calendar } from '@shared/domain/calendar.js';
import { Money } from '@shared/domain/money.js';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { ReferenceItem } from '../domain/reference-item.js';
import { InMemoryCategoryAverageReader } from '../infrastructure/in-memory/in-memory-category-average-reader.js';
import { InMemoryReferenceItemRepository } from '../infrastructure/in-memory/in-memory-reference-item.repository.js';
import { DescribeEquivalences } from './describe-equivalences.js';

const USER_ID = '0192f3c1-7a1b-7c3e-9f20-000000000001';
const NOW = new Date('2026-10-14T00:47:00.000Z');

let items: InMemoryReferenceItemRepository;
let averages: InMemoryCategoryAverageReader;
let equivalences: DescribeEquivalences;

function anItem(id: string, unitPriceInCents: number): ReferenceItem {
  return ReferenceItem.of({
    id,
    singular: id,
    plural: `${id}s`,
    unitPrice: Money.restore(unitPriceInCents),
    source: 'Estimativa arredondada para a demonstração',
    reviewedAt: '2026-10-01',
  });
}

beforeEach(() => {
  items = new InMemoryReferenceItemRepository();
  averages = new InMemoryCategoryAverageReader();
  equivalences = new DescribeEquivalences({
    items,
    averages,
    calendar: new Calendar('America/Sao_Paulo'),
    clock: new FixedClock(NOW),
  });
});

describe('DescribeEquivalences', () => {
  describe('own spending', () => {
    it('says a total in whole months of what they actually spend', async () => {
      averages.record({ completeMonths: 11, averages: [['GROCERIES', 47_895]] });

      const described = await equivalences.describe({ userId: USER_ID, totalInCents: 853_000 });

      expect(described.ownSpending[0]).toEqual({
        category: 'GROCERIES',
        months: 17,
        monthlyAverage: { amountInCents: 47_895, currency: 'BRL' },
        completeMonthsCounted: 11,
      });
    });

    it('reports what the average covers, so the detail line can stay honest', async () => {
      averages.record({ completeMonths: 3, averages: [['HOUSING', 100_000]] });

      const described = await equivalences.describe({ userId: USER_ID, totalInCents: 500_000 });

      expect(described.ownSpending[0]?.completeMonthsCounted).toBe(3);
    });

    it('leaves out a category the total does not reach one month of', async () => {
      averages.record({
        completeMonths: 11,
        averages: [
          ['GROCERIES', 50_000],
          ['HOUSING', 900_000],
        ],
      });

      const described = await equivalences.describe({ userId: USER_ID, totalInCents: 100_000 });

      expect(described.ownSpending.map((own) => own.category)).toEqual(['GROCERIES']);
    });

    it('is empty for a reader with no complete month of history', async () => {
      averages.record({ completeMonths: 0, averages: [['GROCERIES', 50_000]] });
      items.stock(anItem('notebook', 250_000));

      const described = await equivalences.describe({ userId: USER_ID, totalInCents: 900_000 });

      expect(described.ownSpending).toEqual([]);
      expect(described.referenceItems).toHaveLength(1);
    });

    it('returns the categories in the order the card reads in', async () => {
      averages.record({
        completeMonths: 11,
        averages: [
          ['SUBSCRIPTIONS', 5_000],
          ['GROCERIES', 50_000],
          ['TRANSPORT', 10_000],
          ['HOUSING', 150_000],
          ['DINING', 20_000],
        ],
      });

      const described = await equivalences.describe({ userId: USER_ID, totalInCents: 900_000 });

      expect(described.ownSpending.map((own) => own.category)).toEqual([
        'GROCERIES',
        'HOUSING',
        'DINING',
        'TRANSPORT',
        'SUBSCRIPTIONS',
      ]);
    });

    it('asks only about complete months, never the one still being lived', async () => {
      averages.record({ completeMonths: 11, averages: [] });
      let asked: readonly string[] = [];
      const recording = {
        averagesOverMonths: async (_userId: string, monthKeys: readonly string[]) => {
          asked = monthKeys;

          return await averages.averagesOverMonths(_userId, monthKeys);
        },
      };

      await new DescribeEquivalences({
        items,
        averages: recording,
        calendar: new Calendar('America/Sao_Paulo'),
        clock: new FixedClock(NOW),
      }).describe({ userId: USER_ID, totalInCents: 100_000 });

      expect(asked).toHaveLength(11);
      expect(asked).not.toContain('2026-10');
      expect(asked[0]).toBe('2026-09');
    });
  });

  describe('the reference catalogue', () => {
    it('divides the total into whole units, priciest first', async () => {
      items.stock(anItem('notebook', 250_000), anItem('passagem', 90_000));

      const described = await equivalences.describe({ userId: USER_ID, totalInCents: 853_000 });

      expect(described.referenceItems.map((item) => [item.id, item.quantity])).toEqual([
        ['notebook', 3],
        ['passagem', 9],
      ]);
    });

    it('aims a goal at exactly the amount the card named', async () => {
      items.stock(anItem('passagem', 90_000));

      const described = await equivalences.describe({ userId: USER_ID, totalInCents: 853_000 });

      expect(described.referenceItems[0]?.target).toEqual({
        amountInCents: 810_000,
        currency: 'BRL',
      });
    });

    it('omits anything the total does not buy one of', async () => {
      items.stock(anItem('carro', 3_500_000), anItem('passagem', 90_000));

      const described = await equivalences.describe({ userId: USER_ID, totalInCents: 232_000 });

      expect(described.referenceItems.map((item) => item.id)).toEqual(['passagem']);
    });

    it('carries the day each price was last reviewed', async () => {
      items.stock(anItem('notebook', 250_000));

      const described = await equivalences.describe({ userId: USER_ID, totalInCents: 500_000 });

      expect(described.referenceItems[0]?.reviewedAt).toBe('2026-10-01');
    });

    it('reflects a corrected price on the next request, with no deploy', async () => {
      items.stock(anItem('notebook', 250_000));

      const before = await equivalences.describe({ userId: USER_ID, totalInCents: 500_000 });

      items = new InMemoryReferenceItemRepository();
      items.stock(anItem('notebook', 100_000));
      const after = await new DescribeEquivalences({
        items,
        averages,
        calendar: new Calendar('America/Sao_Paulo'),
        clock: new FixedClock(NOW),
      }).describe({ userId: USER_ID, totalInCents: 500_000 });

      expect(before.referenceItems[0]?.quantity).toBe(2);
      expect(after.referenceItems[0]?.quantity).toBe(5);
    });
  });

  it('says nothing at all about a total of zero', async () => {
    averages.record({ completeMonths: 11, averages: [['GROCERIES', 50_000]] });
    items.stock(anItem('passagem', 90_000));

    const described = await equivalences.describe({ userId: USER_ID, totalInCents: 0 });

    expect(described).toEqual({ ownSpending: [], referenceItems: [] });
  });
});
