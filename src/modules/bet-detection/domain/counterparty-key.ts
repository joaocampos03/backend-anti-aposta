/**
 * Everything a statement line puts between the reader and the operator's name.
 *
 * `BETANO*PIX`, `PIX ENVIADO BETANO` and `Betano` are the same house to a
 * person, so they have to be the same house to the grouping. The list is
 * deliberately short: an over-eager rule merges two operators whose names share
 * a word, and a wrong merge is worse than a missed one here.
 */
const PAYMENT_PROCESSOR_WORDS: readonly string[] = [
  'PIX',
  'TED',
  'DOC',
  'BOLETO',
  'PAGAMENTO',
  'PAGTO',
  'PAG',
  'COMPRA',
  'DEBITO',
  'CREDITO',
  'TRANSFERENCIA',
  'ENVIADO',
  'RECEBIDO',
  'LTDA',
  'SA',
  'ME',
];

const COMBINING_MARKS = /[̀-ͯ]/g;
const NON_ALPHANUMERIC = /[^A-Z0-9]+/g;

/**
 * The normalised counterparty an unregistered bookmaker is grouped by: case
 * folded, accent stripped, and without the payment-processor noise the bank
 * wraps the name in.
 *
 * It exists because the registry cannot know every operator. A house that
 * matched on MCC or on a keyword alone still has to group the same way on every
 * request, or the ranking reshuffles between two loads of the same screen.
 */
export class CounterpartyKey {
  private constructor(readonly value: string) {}

  static of(counterparty: string): CounterpartyKey {
    return new CounterpartyKey(CounterpartyKey.fold(counterparty));
  }

  get isEmpty(): boolean {
    return this.value.length === 0;
  }

  equals(other: CounterpartyKey): boolean {
    return this.value === other.value;
  }

  /**
   * Everything after the first `*` is the acquirer's tag rather than the
   * merchant's name, so it goes before anything else does.
   */
  private static fold(counterparty: string): string {
    const withoutAcquirerTag = counterparty.split('*')[0] ?? '';

    return withoutAcquirerTag
      .normalize('NFD')
      .replace(COMBINING_MARKS, '')
      .toUpperCase()
      .replace(NON_ALPHANUMERIC, ' ')
      .split(' ')
      .filter((word) => word.length > 0 && !PAYMENT_PROCESSOR_WORDS.includes(word))
      .join(' ');
  }
}
