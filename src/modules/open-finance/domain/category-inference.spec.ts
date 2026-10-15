import { describe, expect, it } from 'vitest';
import { inferCategory } from './category-inference.js';

describe('inferCategory', () => {
  it('files a card payment by its MCC', () => {
    expect(inferCategory({ merchantCategoryCode: 5411, isCredit: false, method: 'CREDIT_CARD' })).toBe(
      'GROCERIES',
    );
    expect(inferCategory({ merchantCategoryCode: 5812, isCredit: false, method: 'DEBIT_CARD' })).toBe(
      'DINING',
    );
  });

  it('never files anything as BETS: that is the classification, not the category', () => {
    expect(inferCategory({ merchantCategoryCode: 7995, isCredit: false, method: 'CREDIT_CARD' })).toBe(
      'OTHER',
    );
    expect(inferCategory({ merchantCategoryCode: null, isCredit: false, method: 'PIX' })).toBe(
      'TRANSFER',
    );
  });

  it('files a credit with no known merchant as income', () => {
    expect(inferCategory({ merchantCategoryCode: null, isCredit: true, method: 'TRANSFER' })).toBe(
      'INCOME',
    );
  });

  it('files a merchant refund under the merchant, not as income', () => {
    expect(inferCategory({ merchantCategoryCode: 5651, isCredit: true, method: 'CREDIT_CARD' })).toBe(
      'SHOPPING',
    );
  });

  it('falls back on OTHER rather than guessing', () => {
    expect(inferCategory({ merchantCategoryCode: 1234, isCredit: false, method: 'BOLETO' })).toBe(
      'OTHER',
    );
  });

  /**
   * Payroll and an account-to-account transfer both arrive as `TRANSFER`, so
   * the method cannot tell them apart. Money the reader moved from their own
   * account is not money that came in, and filing it as income would inflate
   * the denominator the betting screen states a share against.
   */
  it('files money moved between accounts as a transfer, not as income', () => {
    expect(
      inferCategory({
        merchantCategoryCode: null,
        isCredit: true,
        method: 'TRANSFER',
        isAccountToAccountTransfer: true,
      }),
    ).toBe('TRANSFER');
  });

  it('still files payroll as income', () => {
    expect(
      inferCategory({
        merchantCategoryCode: null,
        isCredit: true,
        method: 'TRANSFER',
        isAccountToAccountTransfer: false,
      }),
    ).toBe('INCOME');
  });
});
