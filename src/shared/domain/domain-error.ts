/**
 * A domain error is a value, not a thrown exception, and carries no user-facing
 * text: the domain layer knows nothing about the language the API answers in.
 * The application layer translates a code into an `AppError` with its Portuguese
 * message.
 */
export interface DomainError {
  readonly code: string;
}
