import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BankAccount } from './bank-account.js';
import { SandboxBankError } from './sandbox-bank.errors.js';

export type ConsentStatus = 'AWAITING_AUTHORISATION' | 'AUTHORISED' | 'REJECTED' | 'REVOKED';

/** The specification's permission names, limited to what a statement needs. */
export type Permission = 'ACCOUNTS_READ' | 'ACCOUNTS_TRANSACTIONS_READ' | 'RESOURCES_READ';

/** Open Finance Brasil caps a data-sharing consent at twelve months. */
export const MAXIMUM_CONSENT_LIFETIME_IN_DAYS = 365;
const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

interface ConsentProperties {
  readonly clientId: string;
  readonly status: ConsentStatus;
  readonly permissions: readonly Permission[];
  /** Null until authorised: before that, the bank does not know whose it is. */
  readonly customerId: UniqueEntityId | null;
  readonly accountIds: readonly UniqueEntityId[];
  readonly createdAt: Date;
  readonly statusUpdatedAt: Date;
  readonly expiresAt: Date;
}

/**
 * The bank's side of a consent: what a DataRecipient asked to read, and what
 * the customer agreed to share.
 *
 * It is a different aggregate from `open-finance`'s `Consent`, in a different
 * context, linked only by the id the bank hands back. That is the point: the
 * two sides of the protocol keep separate records and meet over HTTP.
 */
export class Consent extends AggregateRoot {
  private properties: ConsentProperties;

  private constructor(id: UniqueEntityId, properties: ConsentProperties) {
    super(id);
    this.properties = properties;
  }

  /** A client asks; nothing is shared until a customer says yes. */
  static request(input: {
    readonly id: UniqueEntityId;
    readonly clientId: string;
    readonly permissions: readonly Permission[];
    readonly createdAt: Date;
    readonly expiresAt: Date;
  }): Result<Consent, SandboxBankError<'INVALID_CONSENT_REQUEST'>> {
    if (!Consent.isAcceptableRequest(input)) {
      return fail(SandboxBankError.invalidConsentRequest());
    }

    return ok(
      new Consent(input.id, {
        clientId: input.clientId,
        status: 'AWAITING_AUTHORISATION',
        permissions: [...new Set(input.permissions)],
        customerId: null,
        accountIds: [],
        createdAt: input.createdAt,
        statusUpdatedAt: input.createdAt,
        expiresAt: input.expiresAt,
      }),
    );
  }

  static restore(id: UniqueEntityId, properties: ConsentProperties): Consent {
    return new Consent(id, properties);
  }

  private static isAcceptableRequest(input: {
    readonly permissions: readonly Permission[];
    readonly createdAt: Date;
    readonly expiresAt: Date;
  }): boolean {
    const latestExpiry =
      input.createdAt.getTime() + MAXIMUM_CONSENT_LIFETIME_IN_DAYS * MILLISECONDS_IN_A_DAY;

    return (
      input.permissions.includes('ACCOUNTS_READ') &&
      input.expiresAt > input.createdAt &&
      input.expiresAt.getTime() <= latestExpiry
    );
  }

  get clientId(): string {
    return this.properties.clientId;
  }

  get status(): ConsentStatus {
    return this.properties.status;
  }

  get permissions(): readonly Permission[] {
    return this.properties.permissions;
  }

  get customerId(): UniqueEntityId | null {
    return this.properties.customerId;
  }

  get accountIds(): readonly UniqueEntityId[] {
    return this.properties.accountIds;
  }

  get createdAt(): Date {
    return this.properties.createdAt;
  }

  get statusUpdatedAt(): Date {
    return this.properties.statusUpdatedAt;
  }

  get expiresAt(): Date {
    return this.properties.expiresAt;
  }

  isAwaitingAuthorisationAt(moment: Date): boolean {
    return this.properties.status === 'AWAITING_AUTHORISATION' && moment < this.properties.expiresAt;
  }

  isActiveAt(moment: Date): boolean {
    return this.properties.status === 'AUTHORISED' && moment < this.properties.expiresAt;
  }

  /** The gate in front of every statement the bank serves. */
  sharesAccountAt(accountId: UniqueEntityId, moment: Date): boolean {
    return (
      this.isActiveAt(moment) && this.properties.accountIds.some((id) => id.equals(accountId))
    );
  }

  belongsToClient(clientId: string): boolean {
    return this.properties.clientId === clientId;
  }

  /**
   * The customer says yes, for the accounts they picked. Only their own, and at
   * least one: a consent that shares nothing is a consent nobody needed.
   */
  authorise(input: {
    readonly customerId: UniqueEntityId;
    readonly accounts: readonly BankAccount[];
    readonly moment: Date;
  }): Result<void, SandboxBankError> {
    if (!this.isAwaitingAuthorisationAt(input.moment)) {
      return fail(SandboxBankError.consentNotAwaitingAuthorisation());
    }

    if (input.accounts.length === 0) {
      return fail(SandboxBankError.noAccountSelected());
    }

    if (!input.accounts.every((account) => account.isOwnedBy(input.customerId))) {
      return fail(SandboxBankError.accountNotOwned());
    }

    this.properties = {
      ...this.properties,
      status: 'AUTHORISED',
      customerId: input.customerId,
      accountIds: input.accounts.map((account) => account.id),
      statusUpdatedAt: input.moment,
    };

    return ok(undefined);
  }

  reject(moment: Date): Result<void, SandboxBankError<'CONSENT_NOT_AWAITING_AUTHORISATION'>> {
    if (!this.isAwaitingAuthorisationAt(moment)) {
      return fail(SandboxBankError.consentNotAwaitingAuthorisation());
    }

    this.properties = { ...this.properties, status: 'REJECTED', statusUpdatedAt: moment };

    return ok(undefined);
  }

  /** Idempotent: the DataRecipient may call it again after a timeout. */
  revoke(moment: Date): void {
    if (this.properties.status === 'REVOKED') {
      return;
    }

    this.properties = { ...this.properties, status: 'REVOKED', statusUpdatedAt: moment };
  }
}
