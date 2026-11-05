/**
 * Erases what every other context keeps about a person. Answers `false` when any
 * of them could not finish, and must be safe to run again.
 *
 * A direct call rather than an event, deliberately. The bus logs a failing
 * subscriber and carries on, which is right for a reaction but not here: the
 * account may only go once every context has confirmed, and an event would delete
 * it first and strand whatever failed, with no account left to retry from.
 */
export interface AccountErasure {
  eraseEverythingOf(userId: string): Promise<boolean>;
}
