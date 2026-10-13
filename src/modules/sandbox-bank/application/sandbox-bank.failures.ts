import { AppError, type AppErrorDetails } from '@shared/application/app-error.js';
import { assertNever } from '@shared/domain/assert-never.js';
import type { SandboxBankError } from '../domain/sandbox-bank.errors.js';
import { SANDBOX_BANK_MESSAGES } from './sandbox-bank.messages.js';

/**
 * The only place a sandbox error code becomes a status and a sentence. The
 * OAuth codes keep OAuth's names (`INVALID_GRANT` is rendered as `invalid_grant`
 * on the token endpoint), because a client library switches on them.
 */
export const sandboxBankFailures = {
  invalidClient: (): AppError =>
    new AppError('INVALID_CLIENT', SANDBOX_BANK_MESSAGES.clientNotRecognised, 401),

  invalidGrant: (): AppError =>
    new AppError('INVALID_GRANT', SANDBOX_BANK_MESSAGES.invalidGrant, 400),

  invalidTokenRequest: (details: AppErrorDetails = {}): AppError =>
    new AppError('INVALID_REQUEST', SANDBOX_BANK_MESSAGES.invalidTokenRequest, 400, details),

  unauthenticated: (): AppError =>
    new AppError('UNAUTHORIZED', SANDBOX_BANK_MESSAGES.unauthenticated, 401),

  consentNotFound: (): AppError =>
    new AppError('CONSENT_NOT_FOUND', SANDBOX_BANK_MESSAGES.consentNotFound, 404),

  consentNotActive: (): AppError =>
    new AppError('CONSENT_NOT_ACTIVE', SANDBOX_BANK_MESSAGES.consentNotActive, 403),

  permissionNotGranted: (): AppError =>
    new AppError('PERMISSION_NOT_GRANTED', SANDBOX_BANK_MESSAGES.permissionNotGranted, 403),

  /** Never redirected: a bad redirect is exactly where a code must not go. */
  invalidAuthorisationRequest: (): AppError =>
    new AppError(
      'INVALID_AUTHORISATION_REQUEST',
      SANDBOX_BANK_MESSAGES.invalidAuthorisationRequest,
      400,
    ),

  accountNotFound: (): AppError =>
    new AppError('ACCOUNT_NOT_FOUND', SANDBOX_BANK_MESSAGES.accountNotFound, 404),

  validationFailed: (details: AppErrorDetails): AppError =>
    new AppError('VALIDATION_FAILED', SANDBOX_BANK_MESSAGES.validationFailed, 422, details),

  fromDomain: (error: SandboxBankError): AppError => {
    switch (error.code) {
      case 'INVALID_LEDGER_ENTRY':
        return new AppError('INVALID_LEDGER_ENTRY', SANDBOX_BANK_MESSAGES.invalidLedgerEntry, 422);
      case 'INVALID_CONSENT_REQUEST':
        return new AppError(
          'INVALID_CONSENT_REQUEST',
          SANDBOX_BANK_MESSAGES.invalidConsentRequest,
          422,
        );
      case 'CONSENT_NOT_AWAITING_AUTHORISATION':
        return new AppError(
          'CONSENT_NOT_AWAITING_AUTHORISATION',
          SANDBOX_BANK_MESSAGES.consentNotAwaitingAuthorisation,
          409,
        );
      case 'NO_ACCOUNT_SELECTED':
        return new AppError('NO_ACCOUNT_SELECTED', SANDBOX_BANK_MESSAGES.noAccountSelected, 422);
      // Somebody else's account is answered exactly as a missing one.
      case 'ACCOUNT_NOT_OWNED':
        return sandboxBankFailures.accountNotFound();
      case 'INVALID_GRANT':
        return sandboxBankFailures.invalidGrant();
      default:
        return assertNever(error.code);
    }
  },
} as const;
