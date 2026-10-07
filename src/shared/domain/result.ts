/**
 * `Result` carries expected outcomes — an invalid e-mail, an expired consent, a
 * forbidden access. Exceptions are reserved for programmer errors and for
 * infrastructure that genuinely failed.
 */
export type Result<TValue, TError> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: TError };

export function ok<TValue>(value: TValue): Result<TValue, never> {
  return { ok: true, value };
}

export function fail<TError>(error: TError): Result<never, TError> {
  return { ok: false, error };
}
