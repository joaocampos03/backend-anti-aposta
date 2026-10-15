import { BookmakerId } from './bookmaker-id.js';
import type { BookmakerRegistry } from './bookmaker-registry.js';
import type { Cnpj } from './cnpj.js';
import { CounterpartyKey } from './counterparty-key.js';

/**
 * Whether the grouping came from the registry or from a counterparty name.
 *
 * The screen does not show it. It is on the wire because an unregistered
 * grouping can merge two houses with similar names or split one house's two
 * spellings, and the paper has to be able to say how often that happened.
 */
export type RegistryStatus = 'REGISTERED' | 'UNREGISTERED';

/** The name shown when the bank sent a line with nothing nameable in it. */
export const UNNAMED_BOOKMAKER = 'Casa não identificada';

/**
 * Which bookmaker a betting transaction belongs to, and what to call it.
 *
 * Resolved when the chain runs, and re-resolved whenever it runs again: a house
 * the registry gained since is a registered house from that moment on, and the
 * ranking must not keep showing yesterday's name for it.
 */
export class BookmakerIdentity {
  private constructor(
    readonly bookmakerId: BookmakerId,
    readonly name: string,
    readonly registryStatus: RegistryStatus,
  ) {}

  static resolve(input: {
    readonly counterparty: string;
    readonly counterpartyDocument: Cnpj | null;
    readonly registry: BookmakerRegistry;
  }): BookmakerIdentity {
    const registered =
      input.counterpartyDocument === null
        ? null
        : input.registry.entryFor(input.counterpartyDocument);

    if (registered !== null) {
      return new BookmakerIdentity(
        BookmakerId.forRegistered(registered.id.value),
        registered.tradeName,
        'REGISTERED',
      );
    }

    const key = CounterpartyKey.of(input.counterparty);

    return new BookmakerIdentity(
      BookmakerId.forUnregistered(key),
      BookmakerIdentity.displayName(input.counterparty),
      'UNREGISTERED',
    );
  }

  static restore(input: {
    readonly bookmakerId: string;
    readonly name: string;
    readonly registryStatus: RegistryStatus;
  }): BookmakerIdentity {
    return new BookmakerIdentity(
      BookmakerId.restore(input.bookmakerId),
      input.name,
      input.registryStatus,
    );
  }

  /**
   * A row the product called a bet before it knew how to attribute one.
   *
   * It is grouped under one unnamed house rather than dropped: its amount is in
   * the statement's betting total, and a betting screen that quietly left it
   * out would disagree with the statement by exactly that much.
   */
  static unattributed(): BookmakerIdentity {
    return new BookmakerIdentity(
      BookmakerId.forUnregistered(CounterpartyKey.of('')),
      UNNAMED_BOOKMAKER,
      'UNREGISTERED',
    );
  }

  equals(other: BookmakerIdentity): boolean {
    return (
      this.bookmakerId.equals(other.bookmakerId) &&
      this.name === other.name &&
      this.registryStatus === other.registryStatus
    );
  }

  /**
   * The counterparty as the statement had it, which is already a normalised
   * merchant name rather than the raw line. The folded key groups; this names.
   */
  private static displayName(counterparty: string): string {
    const trimmed = counterparty.trim();

    return trimmed.length === 0 ? UNNAMED_BOOKMAKER : trimmed;
  }
}
