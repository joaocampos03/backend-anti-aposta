import type {
  ConsentDto,
  IssuedTokenDto,
  SharedAccountsOutput,
  SharedTransactionDto,
  SharedTransactionsOutput,
} from '../application/dto/protocol.dto.js';
import { CONSENT_URN_PREFIX } from './sandbox-bank.schemas.js';

const CENTS_IN_A_REAL = 100;
const MCC_DIGITS = 4;
const ACCOUNT_SUBTYPE = 'INDIVIDUAL';

/**
 * The Open Finance Brasil wire format: `data`, `links`, `meta`, the
 * specification's field names, amounts as decimal strings. Every field is
 * spelled out — a spread would ship whatever the DTO grows.
 */
export const OpenFinanceWirePresenter = {
  /** RFC 6749 §5.1, snake case as the RFC has it. */
  token: (dto: IssuedTokenDto): unknown => ({
    access_token: dto.accessToken,
    token_type: 'Bearer',
    expires_in: dto.expiresInSeconds,
    ...(dto.refreshToken === null ? {} : { refresh_token: dto.refreshToken }),
    scope: dto.scope,
  }),

  consentUrn: (consentId: string): string => `${CONSENT_URN_PREFIX}${consentId}`,

  consent: (dto: ConsentDto, selfUrl: string, requestDateTime: string): unknown => ({
    data: {
      consentId: `${CONSENT_URN_PREFIX}${dto.consentId}`,
      creationDateTime: dto.createdAt,
      status: dto.status,
      statusUpdateDateTime: dto.statusUpdatedAt,
      permissions: dto.permissions,
      expirationDateTime: dto.expiresAt,
    },
    links: { self: selfUrl },
    meta: { totalRecords: 1, totalPages: 1, requestDateTime },
  }),

  accounts: (output: SharedAccountsOutput, selfUrl: string, requestDateTime: string): unknown => ({
    data: output.accounts.map((account) => ({
      brandName: account.brandName,
      companyCnpj: account.companyCnpj,
      type: account.type,
      subtype: ACCOUNT_SUBTYPE,
      compeCode: account.compeCode,
      branchCode: account.branchCode,
      number: account.number,
      checkDigit: account.checkDigit,
      accountId: account.accountId,
    })),
    links: { self: selfUrl },
    meta: { totalRecords: output.accounts.length, totalPages: 1, requestDateTime },
  }),

  transactions: (
    output: SharedTransactionsOutput,
    selfUrl: string,
    requestDateTime: string,
  ): unknown => ({
    data: output.transactions.map(toWireTransaction),
    links: linksFor(selfUrl, output),
    meta: {
      totalRecords: output.totalRecords,
      totalPages: output.totalPages,
      requestDateTime,
    },
  }),
} as const;

function toWireTransaction(transaction: SharedTransactionDto): unknown {
  return {
    transactionId: transaction.transactionId,
    completedAuthorisedPaymentType: transaction.status,
    creditDebitType: transaction.amountInCents < 0 ? 'DEBITO' : 'CREDITO',
    transactionName: transaction.transactionName,
    type: transaction.type,
    transactionAmount: { amount: decimalOf(transaction.amountInCents), currency: 'BRL' },
    transactionDateTime: transaction.bookedAt,
    ...(transaction.merchantCategoryCode === null
      ? {}
      : { merchantCategoryCode: String(transaction.merchantCategoryCode).padStart(MCC_DIGITS, '0') }),
    ...(transaction.payeeDocument === null ? {} : { payeeDocument: transaction.payeeDocument }),
  };
}

/** Cents to the specification's "1234.56", by integer arithmetic. Always positive. */
function decimalOf(amountInCents: number): string {
  const magnitude = Math.abs(amountInCents);
  const fraction = String(magnitude % CENTS_IN_A_REAL).padStart(2, '0');

  return `${String(Math.trunc(magnitude / CENTS_IN_A_REAL))}.${fraction}`;
}

function linksFor(
  selfUrl: string,
  output: SharedTransactionsOutput,
): { readonly self: string; readonly next?: string } {
  if (output.page >= output.totalPages) {
    return { self: selfUrl };
  }

  const next = new URL(selfUrl);
  next.searchParams.set('page', String(output.page + 1));

  return { self: selfUrl, next: next.toString() };
}
