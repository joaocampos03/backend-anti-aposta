import type { PaymentMethod, TransactionCategory } from './transaction-attributes.js';

/**
 * Open Finance Brasil sends no category: a transaction arrives with a name, a
 * type, an amount and — for card payments — an MCC. The category the statement
 * shows is therefore **ours to infer**, and this table is that inference.
 *
 * It is an assumed default rather than a product decision, and it is kept
 * deliberately small: an MCC it does not know falls back on the direction and
 * the method, never on a guess.
 *
 * It never infers `BETS`. Whether a movement is a bet is `bet-detection`'s
 * verdict, projected onto the row; the charts already bucket by that verdict,
 * so filing a bet under `TRANSFER` or `OTHER` here changes no figure.
 */
const CATEGORY_BY_MCC: ReadonlyMap<number, TransactionCategory> = new Map([
  ...mccs([5411, 5422, 5441, 5451, 5462, 5499], 'GROCERIES'),
  ...mccs([5812, 5813, 5814], 'DINING'),
  ...mccs([4111, 4121, 4131, 4789, 5541, 5542], 'TRANSPORT'),
  ...mccs([4900, 6513], 'HOUSING'),
  ...mccs([5912, 8011, 8021, 8062, 8099], 'HEALTH'),
  ...mccs([4899, 5815, 5816, 5817, 5818], 'SUBSCRIPTIONS'),
  ...mccs([5311, 5651, 5691, 5732, 5942, 5999], 'SHOPPING'),
]);

function mccs(
  codes: readonly number[],
  category: TransactionCategory,
): readonly [number, TransactionCategory][] {
  return codes.map((code) => [code, category]);
}

const TRANSFER_METHODS: readonly PaymentMethod[] = ['PIX', 'TRANSFER'];

export function inferCategory(input: {
  readonly merchantCategoryCode: number | null;
  readonly isCredit: boolean;
  readonly method: PaymentMethod;
  readonly isAccountToAccountTransfer?: boolean;
}): TransactionCategory {
  const byMcc =
    input.merchantCategoryCode === null ? undefined : CATEGORY_BY_MCC.get(input.merchantCategoryCode);

  if (byMcc !== undefined) {
    return byMcc;
  }

  // Money moving between accounts is a transfer whichever way it goes. It is
  // not earnings, and filing it as `INCOME` would inflate the denominator the
  // betting screen states a share of income against.
  if (input.isAccountToAccountTransfer === true) {
    return 'TRANSFER';
  }

  if (input.isCredit) {
    return 'INCOME';
  }

  return TRANSFER_METHODS.includes(input.method) ? 'TRANSFER' : 'OTHER';
}
