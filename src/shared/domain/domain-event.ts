/**
 * Events are published after the owning transaction commits. Payloads carry ids
 * and primitives only — never an aggregate instance, never a database row — and
 * names are past tense.
 */
export interface DomainEvent<TPayload = unknown> {
  readonly name: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}
