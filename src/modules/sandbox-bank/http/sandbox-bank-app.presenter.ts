import type {
  AuthorisationRequestOutput,
  CustomerAccountDto,
  CustomerAccountsOutput,
  LedgerEntryDto,
} from '../application/dto/bank-app.dto.js';

/** The bank's screens, in this API's camelCase. Every field spelled out. */
export const SandboxBankAppPresenter = {
  authorisationRequest: (output: AuthorisationRequestOutput): unknown => ({
    client: { displayName: output.client.displayName },
    consent: {
      id: output.consent.id,
      permissions: output.consent.permissions,
      expiresAt: output.consent.expiresAt,
    },
    accounts: output.accounts.map(toAccount),
  }),

  accounts: (output: CustomerAccountsOutput): unknown => ({
    items: output.items.map(toAccount),
    nextCursor: output.nextCursor,
  }),

  ledgerEntry: (entry: LedgerEntryDto): unknown => ({
    entry: {
      id: entry.id,
      accountId: entry.accountId,
      bookedAt: entry.bookedAt,
      amount: { amountInCents: entry.amountInCents, currency: 'BRL' },
      transactionName: entry.transactionName,
      type: entry.type,
      status: entry.status,
      merchantCategoryCode: entry.merchantCategoryCode,
      payeeDocument: entry.payeeDocument,
    },
  }),
} as const;

function toAccount(account: CustomerAccountDto): unknown {
  return {
    id: account.id,
    type: account.type,
    brandName: account.brandName,
    branchCode: account.branchCode,
    numberEnding: account.numberEnding,
  };
}
