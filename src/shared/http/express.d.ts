declare global {
  namespace Express {
    interface Locals {
      /** Correlates every log line of one request; echoed as `x-request-id`. */
      requestId: string;
      /**
       * Who is asking, resolved from the session token by `requireSession`.
       * Absent on public routes.
       */
      userId?: string;
      /**
       * What the error funnel says when this route fails unexpectedly. Each
       * route states its own, because "não conseguimos criar sua conta" and
       * "não conseguimos carregar suas transações" are not interchangeable.
       */
      internalErrorMessage?: string;
    }
  }
}

export {};
