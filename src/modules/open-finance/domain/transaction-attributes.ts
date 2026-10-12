/**
 * A closed enum, and the contract. The Portuguese label and the icon are the
 * frontend's: the enum is what travels, so two screens cannot disagree about
 * what a category is called.
 */
export type TransactionCategory =
  | 'BETS'
  | 'GROCERIES'
  | 'DINING'
  | 'TRANSPORT'
  | 'HOUSING'
  | 'HEALTH'
  | 'SUBSCRIPTIONS'
  | 'SHOPPING'
  | 'INCOME'
  | 'TRANSFER'
  | 'OTHER';

export const TRANSACTION_CATEGORIES: readonly TransactionCategory[] = [
  'BETS',
  'GROCERIES',
  'DINING',
  'TRANSPORT',
  'HOUSING',
  'HEALTH',
  'SUBSCRIPTIONS',
  'SHOPPING',
  'INCOME',
  'TRANSFER',
  'OTHER',
];

/** The only category whose figures point into the account rather than out of it. */
export const INCOMING_CATEGORY: TransactionCategory = 'INCOME';

export type PaymentMethod =
  | 'PIX'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'DIRECT_DEBIT'
  | 'TRANSFER'
  | 'BOLETO';

/** A settled entry is final; a pending one may still change value or be reversed. */
export type TransactionStatus = 'SETTLED' | 'PENDING';

export type AccountKind = 'CHECKING' | 'CREDIT_CARD';
