/**
 * The taxonomy the delivery layer maps to a status code and the single error
 * envelope. `code` is the stable contract the frontend switches on; `message` is
 * the Portuguese sentence a person reads, factual and never moralising.
 */
export type HttpFailureStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500;

/**
 * Keyed by field name when the failure belongs to a field. A number is allowed
 * for the handful of machine-readable details the contract carries, such as
 * `retryAfterSeconds`.
 */
export type AppErrorDetails = Readonly<Record<string, string | number>>;

export class AppError {
  readonly details: AppErrorDetails;

  constructor(
    readonly code: string,
    readonly message: string,
    readonly status: HttpFailureStatus,
    details: AppErrorDetails = {},
  ) {
    this.details = details;
  }
}
