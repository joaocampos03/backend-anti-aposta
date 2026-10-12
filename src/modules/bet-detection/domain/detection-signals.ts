import type { Cnpj } from './cnpj.js';

/**
 * Everything the policy chain is allowed to look at.
 *
 * The raw `description` is here and **nowhere else**: it never reaches a
 * response, an event payload or a log line. The API answers with a normalised
 * counterparty instead, which is derived from it and carries no free text the
 * bank happened to send.
 */
export class DetectionSignals {
  private constructor(
    readonly mcc: number | null,
    readonly counterpartyDocument: Cnpj | null,
    readonly description: string,
  ) {}

  static of(input: {
    readonly mcc?: number | null;
    readonly counterpartyDocument?: Cnpj | null;
    readonly description?: string;
  }): DetectionSignals {
    return new DetectionSignals(
      input.mcc ?? null,
      input.counterpartyDocument ?? null,
      input.description ?? '',
    );
  }
}
