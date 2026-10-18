import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { BadgeCollection, type FamilyAttainments } from '../domain/badge-collection.js';
import type { BadgeCollectionRepository } from '../domain/badge-collection.repository.js';
import { ConcurrentModificationError } from '../domain/gamification.errors.js';

export interface BadgeAwardingDependencies {
  readonly collections: BadgeCollectionRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly events: EventPublisher;
}

/**
 * Awards what the figures say is due, saves it, and publishes the award after
 * the write commits. Shared by the screen's read and by the event reactions,
 * which may run at the same moment: the collection's `version` lets only one of
 * them write, and the loser reads back what the winner awarded — and announced —
 * rather than awarding it a second time.
 */
export class BadgeAwarding {
  constructor(private readonly dependencies: BadgeAwardingDependencies) {}

  async awardDue(userId: string, attainments: FamilyAttainments): Promise<BadgeCollection> {
    const collection = await this.collectionOf(userId);

    const occasion = {
      awardedAt: this.dependencies.clock.now(),
      nextId: () => this.dependencies.idGenerator.generate(),
    };

    if (collection.awardDue(attainments, occasion).length === 0) {
      return collection;
    }

    try {
      await this.dependencies.collections.save(collection);
    } catch (cause) {
      if (!(cause instanceof ConcurrentModificationError)) {
        throw cause;
      }

      return await this.collectionOf(userId);
    }

    await this.dependencies.events.publish(collection.pullEvents());

    return collection;
  }

  /** Created at registration; an account from before that bootstrap gets one here. */
  private async collectionOf(userId: string): Promise<BadgeCollection> {
    const owner = UniqueEntityId.restore(userId);
    const existing = await this.dependencies.collections.findByUserId(owner);

    return (
      existing ??
      BadgeCollection.empty({
        id: this.dependencies.idGenerator.generate(),
        userId: owner,
        createdAt: this.dependencies.clock.now(),
      })
    );
  }
}
