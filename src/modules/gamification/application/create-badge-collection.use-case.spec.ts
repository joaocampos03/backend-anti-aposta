import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { InMemoryBadgeCollectionRepository } from '../infrastructure/in-memory/in-memory-badge-collection.repository.js';
import { CreateBadgeCollection } from './create-badge-collection.use-case.js';

const USER_ID = '0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77';

let collections: InMemoryBadgeCollectionRepository;
let createBadgeCollection: CreateBadgeCollection;

beforeEach(() => {
  collections = new InMemoryBadgeCollectionRepository();
  createBadgeCollection = new CreateBadgeCollection(
    collections,
    new SequentialIdGenerator(),
    new FixedClock(new Date('2026-10-03T13:04:11.182Z')),
  );
});

describe('CreateBadgeCollection', () => {
  it('creates an empty collection, awarding nothing for signing up', async () => {
    await createBadgeCollection.execute({ userId: USER_ID });

    expect(collections.collections[0]?.badges).toEqual([]);
  });

  it('leaves a single collection when the same event arrives twice', async () => {
    await createBadgeCollection.execute({ userId: USER_ID });
    await createBadgeCollection.execute({ userId: USER_ID });

    expect(collections.collections).toHaveLength(1);
  });
});
