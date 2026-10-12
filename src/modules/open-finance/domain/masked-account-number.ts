const VISIBLE_DIGITS = 4;
const NON_DIGITS = /\D/g;
const MASK = '•• ';

/**
 * The last four digits and nothing else.
 *
 * The Open Finance spec's `GET /accounts` returns the number and the check
 * digit in full; the masking happens **at ingestion**, so the full number never
 * exists in this application's database and there is nothing to leak into a log
 * or a server-rendered payload.
 */
export class MaskedAccountNumber {
  private constructor(readonly value: string) {}

  /** Call this at the boundary, with whatever the institution sent. */
  static maskingAtIngestion(fullNumber: string): MaskedAccountNumber {
    const digits = fullNumber.replace(NON_DIGITS, '');

    return new MaskedAccountNumber(`${MASK}${digits.slice(-VISIBLE_DIGITS)}`);
  }

  static restore(masked: string): MaskedAccountNumber {
    return new MaskedAccountNumber(masked);
  }
}
