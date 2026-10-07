/** Makes a non-exhaustive `switch` over a union a compile error. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled union member: ${String(value)}`);
}
