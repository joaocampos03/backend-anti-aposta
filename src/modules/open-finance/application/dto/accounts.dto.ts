import type { AccountKind } from '../../domain/transaction-attributes.js';

export interface ListConnectedAccountsInput {
  readonly userId: string;
}

export interface ConnectedAccountDto {
  readonly id: string;
  readonly institution: string;
  readonly shortName: string;
  readonly product: string;
  readonly maskedNumber: string;
  readonly kind: AccountKind;
}

export interface ConnectedAccountsOutput {
  readonly items: readonly ConnectedAccountDto[];
  readonly nextCursor: null;
}
