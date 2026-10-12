/**
 * The public API of `sandbox-bank` is its HTTP surface, and nothing else.
 *
 * This context is a **foreign system**: the simulated institution that the
 * platform reaches over the Open Finance protocol, exactly as it would reach a
 * real one. No other context imports anything from here — if one ever needs
 * to, the demonstration has been short-circuited. Only the composition root
 * reaches in, to wire the routes.
 */
export {};
