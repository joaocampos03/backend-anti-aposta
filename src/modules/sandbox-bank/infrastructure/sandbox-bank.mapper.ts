import type {
  SandboxAuthorisationCode as AuthorisationCodeRow,
  SandboxBankAccount as BankAccountRow,
  SandboxConsent as ConsentRow,
  SandboxIssuedToken as IssuedTokenRow,
  SandboxLedgerEntry as LedgerEntryRow,
} from '@prisma/client';
import { Money } from '@shared/domain/money.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { AuthorisationCode } from '../domain/authorisation-code.js';
import { BankAccount } from '../domain/bank-account.js';
import { Consent } from '../domain/consent.js';
import { IssuedToken } from '../domain/issued-token.js';
import { LedgerEntry } from '../domain/ledger-entry.js';

/** Prisma rows to the sandbox's aggregates and back. Nothing else crosses. */
export const SandboxBankMapper = {
  account: {
    toDomain: (row: BankAccountRow): BankAccount =>
      BankAccount.restore(UniqueEntityId.restore(row.id), {
        customerId: UniqueEntityId.restore(row.customerId),
        type: row.type,
        brandName: row.brandName,
        companyCnpj: row.companyCnpj,
        compeCode: row.compeCode,
        branchCode: row.branchCode,
        number: row.number,
        checkDigit: row.checkDigit,
        openedAt: row.openedAt,
      }),
    toRow: (account: BankAccount): BankAccountRow => ({
      id: account.id.value,
      customerId: account.customerId.value,
      type: account.type,
      brandName: account.brandName,
      companyCnpj: account.companyCnpj,
      compeCode: account.compeCode,
      branchCode: account.branchCode,
      number: account.number,
      checkDigit: account.checkDigit,
      openedAt: account.openedAt,
    }),
  },

  entry: {
    toDomain: (row: LedgerEntryRow): LedgerEntry =>
      LedgerEntry.restore(UniqueEntityId.restore(row.id), {
        accountId: UniqueEntityId.restore(row.accountId),
        customerId: UniqueEntityId.restore(row.customerId),
        bookedAt: row.bookedAt,
        amount: Money.restore(row.amountInCents),
        transactionName: row.transactionName,
        type: row.type,
        status: row.status,
        merchantCategoryCode: row.merchantCategoryCode,
        payeeDocument: row.payeeDocument,
      }),
    toRow: (entry: LedgerEntry): LedgerEntryRow => ({
      id: entry.id.value,
      accountId: entry.accountId.value,
      customerId: entry.customerId.value,
      bookedAt: entry.bookedAt,
      amountInCents: entry.amount.amountInCents,
      transactionName: entry.transactionName,
      type: entry.type,
      status: entry.status,
      merchantCategoryCode: entry.merchantCategoryCode,
      payeeDocument: entry.payeeDocument,
    }),
  },

  consent: {
    toDomain: (row: ConsentRow): Consent =>
      Consent.restore(UniqueEntityId.restore(row.id), {
        clientId: row.clientId,
        status: row.status,
        permissions: row.permissions,
        customerId: row.customerId === null ? null : UniqueEntityId.restore(row.customerId),
        accountIds: row.accountIds.map((id) => UniqueEntityId.restore(id)),
        createdAt: row.createdAt,
        statusUpdatedAt: row.statusUpdatedAt,
        expiresAt: row.expiresAt,
      }),
    toRow: (consent: Consent): ConsentRow => ({
      id: consent.id.value,
      clientId: consent.clientId,
      status: consent.status,
      permissions: [...consent.permissions],
      customerId: consent.customerId?.value ?? null,
      accountIds: consent.accountIds.map((id) => id.value),
      createdAt: consent.createdAt,
      statusUpdatedAt: consent.statusUpdatedAt,
      expiresAt: consent.expiresAt,
    }),
  },

  code: {
    toDomain: (row: AuthorisationCodeRow): AuthorisationCode =>
      AuthorisationCode.restore(UniqueEntityId.restore(row.id), {
        codeFingerprint: row.codeFingerprint,
        consentId: UniqueEntityId.restore(row.consentId),
        clientId: row.clientId,
        redirectUri: row.redirectUri,
        codeChallenge: row.codeChallenge,
        issuedAt: row.issuedAt,
        expiresAt: row.expiresAt,
        redeemedAt: row.redeemedAt,
      }),
    toRow: (code: AuthorisationCode): AuthorisationCodeRow => ({
      id: code.id.value,
      codeFingerprint: code.codeFingerprint,
      consentId: code.consentId.value,
      clientId: code.clientId,
      redirectUri: code.redirectUri,
      codeChallenge: code.codeChallenge,
      issuedAt: code.issuedAt,
      expiresAt: code.expiresAt,
      redeemedAt: code.redeemedAt,
    }),
  },

  token: {
    toDomain: (row: IssuedTokenRow): IssuedToken =>
      IssuedToken.restore(UniqueEntityId.restore(row.id), {
        tokenFingerprint: row.tokenFingerprint,
        kind: row.kind,
        scope: row.scope,
        clientId: row.clientId,
        consentId: row.consentId === null ? null : UniqueEntityId.restore(row.consentId),
        issuedAt: row.issuedAt,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
      }),
    toRow: (token: IssuedToken): IssuedTokenRow => ({
      id: token.id.value,
      tokenFingerprint: token.tokenFingerprint,
      kind: token.kind,
      scope: token.scope,
      clientId: token.clientId,
      consentId: token.consentId?.value ?? null,
      issuedAt: token.issuedAt,
      expiresAt: token.expiresAt,
      revokedAt: token.revokedAt,
    }),
  },
} as const;
