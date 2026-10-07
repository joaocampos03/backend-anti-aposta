declare global {
  namespace Express {
    interface Locals {
      /** Correlates every log line of one request; echoed as `x-request-id`. */
      requestId: string;
      /**
       * What the error funnel says when this route fails unexpectedly. Each
       * route states its own, because "não conseguimos criar sua conta" and
       * "não conseguimos carregar sua conta" are not interchangeable.
       */
      internalErrorMessage?: string;
    }
  }
}

export {};
